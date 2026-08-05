import { prisma } from "@/lib/prisma";
import { SuggestionStatus, type SuggestionDetail, type SuggestionSummary } from "./types";

const suggestionWithUserSelect = {
  id: true,
  mapFileId: true,
  mapVersionId: true,
  createdById: true,
  status: true,
  category: true,
  title: true,
  comment: true,
  reviewComment: true,
  reviewedAt: true,
  checkoutId: true,
  integratedVersionId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
  integratedVersion: { select: { versionNumber: true } },
  _count: { select: { objects: true } },
} as const;

function parseGeometryJson(json: string) {
  return JSON.parse(json) as SuggestionDetail["objects"][0]["geometry"];
}

export function serializeSuggestionSummary(
  suggestion: {
    id: string;
    status: string;
    category: string;
    title: string | null;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
    mapVersionId: string;
    createdBy: { id: string; name: string | null; email: string };
    mapVersion: { versionNumber: number };
    _count: { objects: number };
  },
): SuggestionSummary {
  return {
    id: suggestion.id,
    status: suggestion.status as SuggestionSummary["status"],
    category: suggestion.category as SuggestionSummary["category"],
    title: suggestion.title,
    comment: suggestion.comment,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
    mapVersionId: suggestion.mapVersionId,
    versionNumber: suggestion.mapVersion.versionNumber,
    createdBy: suggestion.createdBy,
    objectCount: suggestion._count.objects,
  };
}

export function serializeSuggestionDetail(
  suggestion: {
    id: string;
    status: string;
    category: string;
    title: string | null;
    comment: string;
    reviewComment: string | null;
    reviewedAt: Date | null;
    checkoutId: string | null;
    integratedVersionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    mapVersionId: string;
    createdBy: { id: string; name: string | null; email: string };
    reviewedBy: { id: string; name: string | null; email: string } | null;
    mapVersion: { versionNumber: number };
    integratedVersion: { versionNumber: number } | null;
    objects: Array<{
      id: string;
      objectType: string;
      geometryJson: string;
      sortOrder: number;
    }>;
    _count?: { objects: number };
  },
): SuggestionDetail {
  const objects = suggestion.objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((obj) => ({
      id: obj.id,
      objectType: obj.objectType as SuggestionDetail["objects"][0]["objectType"],
      geometry: parseGeometryJson(obj.geometryJson),
      sortOrder: obj.sortOrder,
    }));

  return {
    ...serializeSuggestionSummary({
      ...suggestion,
      _count: suggestion._count ?? { objects: objects.length },
    }),
    reviewComment: suggestion.reviewComment,
    reviewedAt: suggestion.reviewedAt?.toISOString() ?? null,
    reviewedBy: suggestion.reviewedBy,
    checkoutId: suggestion.checkoutId,
    integratedVersionId: suggestion.integratedVersionId,
    integratedVersionNumber: suggestion.integratedVersion?.versionNumber ?? null,
    objects,
  };
}

export async function listSuggestionsForMap(mapFileId: string, status?: string) {
  return prisma.mapSuggestion.findMany({
    where: {
      mapFileId,
      mapVersion: { isPublished: true },
      ...(status ? { status } : {}),
    },
    select: suggestionWithUserSelect,
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function countOpenSuggestionsForUser(mapFileId: string, userId: string) {
  return prisma.mapSuggestion.count({
    where: {
      mapFileId,
      createdById: userId,
      status: SuggestionStatus.OPEN,
    },
  });
}

export async function getSuggestionById(suggestionId: string) {
  return prisma.mapSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
      integratedVersion: { select: { versionNumber: true } },
      objects: { orderBy: { sortOrder: "asc" } },
      _count: { select: { objects: true } },
    },
  });
}

export async function createSuggestion(params: {
  mapFileId: string;
  mapVersionId: string;
  createdById: string;
  category: string;
  title: string | null;
  comment: string;
  geometryJson: string;
}) {
  return prisma.mapSuggestion.create({
    data: {
      mapFileId: params.mapFileId,
      mapVersionId: params.mapVersionId,
      createdById: params.createdById,
      category: params.category,
      title: params.title,
      comment: params.comment,
      objects: {
        create: {
          objectType: "POINT",
          geometryJson: params.geometryJson,
          sortOrder: 0,
        },
      },
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
      integratedVersion: { select: { versionNumber: true } },
      objects: { orderBy: { sortOrder: "asc" } },
      _count: { select: { objects: true } },
    },
  });
}

export async function updateSuggestion(
  suggestionId: string,
  data: {
    category?: string;
    title?: string | null;
    comment?: string;
    status?: string;
    reviewComment?: string | null;
    reviewedById?: string | null;
    reviewedAt?: Date | null;
    checkoutId?: string | null;
    integratedVersionId?: string | null;
    geometryJson?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    if (data.geometryJson) {
      await tx.mapSuggestionObject.deleteMany({ where: { suggestionId } });
      await tx.mapSuggestionObject.create({
        data: {
          suggestionId,
          objectType: "POINT",
          geometryJson: data.geometryJson,
          sortOrder: 0,
        },
      });
    }

    const { geometryJson: _g, ...updateData } = data;

    return tx.mapSuggestion.update({
      where: { id: suggestionId },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        mapVersion: { select: { id: true, versionNumber: true, isPublished: true } },
        integratedVersion: { select: { versionNumber: true } },
        objects: { orderBy: { sortOrder: "asc" } },
        _count: { select: { objects: true } },
      },
    });
  });
}

export async function deleteSuggestion(suggestionId: string) {
  return prisma.mapSuggestion.delete({ where: { id: suggestionId } });
}
