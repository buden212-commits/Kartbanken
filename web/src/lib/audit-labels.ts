import type { AuditAction } from "@/lib/audit";

function metaString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function mapRef(metadata: Record<string, unknown> | null): string | null {
  const slug = metaString(metadata, "mapSlug") ?? metaString(metadata, "slug");
  if (!slug) return null;
  const version = metaString(metadata, "versionNumber");
  return version ? `${slug} (v${version})` : slug;
}

export function parseAuditMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatAuditActivity(action: string, metadataRaw: string | null): string {
  const metadata = parseAuditMetadata(metadataRaw);

  switch (action as AuditAction) {
    case "LOGIN":
      return "Inloggning";
    case "USER_UPDATED": {
      const next = metadata?.next as { email?: string } | undefined;
      const email = next?.email;
      return email ? `Användarkonto uppdaterat (${email})` : "Användarkonto uppdaterat";
    }
    case "UPLOAD": {
      const ref = mapRef(metadata);
      const filename = metaString(metadata, "filename");
      if (ref && filename) return `Uppladdning av kartversion — ${ref}, ${filename}`;
      if (ref) return `Uppladdning av kartversion — ${ref}`;
      return "Uppladdning av kartversion";
    }
    case "DOWNLOAD": {
      const ref = mapRef(metadata);
      const kind = metaString(metadata, "kind");
      if (kind === "subset") return ref ? `Nedladdning av utcheckning — ${ref}` : "Nedladdning av utcheckning";
      if (kind === "integration-warnings") {
        return ref ? `Export av felobjekt — ${ref}` : "Export av felobjekt";
      }
      return ref ? `Nedladdning — ${ref}` : "Nedladdning";
    }
    case "EXPORT_OCD": {
      const ref = mapRef(metadata);
      return ref ? `Export till OCAD — ${ref}` : "Export till OCAD";
    }
    case "ROLE_CHANGE": {
      const from = metaString(metadata, "from");
      const to = metaString(metadata, "to");
      const approveAction = metaString(metadata, "action");
      if (approveAction === "approve") return `Användare godkänd som ${to ?? "?"}`;
      if (approveAction === "reject") return "Användare avvisad";
      if (from && to) return `Roll ändrad från ${from} till ${to}`;
      return "Rolländring";
    }
    case "MAP_CREATE": {
      const title = metaString(metadata, "title");
      return title ? `Kartfil skapad — ${title}` : "Kartfil skapad";
    }
    case "MAP_RENAMED": {
      const previous = metaString(metadata, "previousTitle");
      const next = metaString(metadata, "newTitle");
      if (previous && next) return `Kartfil omdöpt — "${previous}" → "${next}"`;
      return "Kartfil omdöpt";
    }
    case "MAP_DELETED": {
      const title = metaString(metadata, "title");
      return title ? `Kartfil raderad — ${title}` : "Kartfil raderad";
    }
    case "VERSION_DELETED": {
      const ref = mapRef(metadata);
      return ref ? `Version raderad — ${ref}` : "Version raderad";
    }
    case "COMPARE": {
      const slug = metaString(metadata, "mapSlug");
      const v1 = metaString(metadata, "v1");
      const v2 = metaString(metadata, "v2");
      if (slug && v1 && v2) return `Jämförelse — ${slug} v${v1} ↔ v${v2}`;
      return "Jämförelse av versioner";
    }
    case "VERSION_PUBLISH": {
      const ref = mapRef(metadata);
      const published = metadata?.isPublished === true;
      const label = published ? "publicerad" : "opublicerad";
      return ref ? `Version ${label} — ${ref}` : `Version ${label}`;
    }
    case "CHECKOUT_CREATED": {
      const ref = mapRef(metadata);
      return ref ? `Utcheckning skapad — ${ref}` : "Utcheckning skapad";
    }
    case "CHECKIN_SUBMITTED": {
      const ref = mapRef(metadata);
      const filename = metaString(metadata, "filename");
      if (ref && filename) return `Incheckning — ${ref}, ${filename}`;
      return ref ? `Incheckning — ${ref}` : "Incheckning";
    }
    case "CHECKOUT_USER_CONFIRMED": {
      const ref = mapRef(metadata);
      return ref ? `Utcheckning bekräftad av användare — ${ref}` : "Utcheckning bekräftad av användare";
    }
    case "CHECKOUT_INTEGRATED": {
      const ref = mapRef(metadata);
      return ref ? `Utcheckning integrerad — ${ref}` : "Utcheckning integrerad";
    }
    case "CHECKOUT_CANCELLED": {
      const ref = mapRef(metadata);
      return ref ? `Utcheckning avbruten — ${ref}` : "Utcheckning avbruten";
    }
    case "CHECKOUT_REMINDER_SENT": {
      const ref = mapRef(metadata);
      const days = metaString(metadata, "days");
      if (ref && days) return `Påminnelse om utcheckning — ${ref} (${days} dagar)`;
      return ref ? `Påminnelse om utcheckning — ${ref}` : "Påminnelse om utcheckning skickad";
    }
    case "COURSE_CREATED": {
      const name = metaString(metadata, "name");
      const ref = mapRef(metadata);
      if (name && ref) return `Bana skapad — ${name} (${ref})`;
      if (name) return `Bana skapad — ${name}`;
      return "Bana skapad";
    }
    case "COURSE_UPDATED": {
      const name = metaString(metadata, "name");
      return name ? `Bana uppdaterad — ${name}` : "Bana uppdaterad";
    }
    case "COURSE_DELETED": {
      const name = metaString(metadata, "name");
      return name ? `Bana raderad — ${name}` : "Bana raderad";
    }
    case "COURSE_PDF_EXPORT": {
      const ref = mapRef(metadata);
      const scale = metaString(metadata, "scale");
      if (ref && scale) return `PDF-export av bana — ${ref}, skala 1:${scale}`;
      return ref ? `PDF-export av bana — ${ref}` : "PDF-export av bana";
    }
    case "EMAIL_SENT": {
      const kind = metaString(metadata, "kind");
      const kindLabel =
        kind === "checkin"
          ? "E-post vid incheckning"
          : kind === "new_upload"
            ? "E-post om ny version"
            : kind === "test"
              ? "Testmail"
              : "E-post skickad";
      const mapTitle = metaString(metadata, "mapTitle");
      const withAttachment = metadata?.withAttachment === true;
      const filename = metaString(metadata, "attachmentFilename");
      const withList = Array.isArray(metadata?.recipientsWithAttachment)
        ? metadata.recipientsWithAttachment.filter((entry): entry is string => typeof entry === "string")
        : [];
      const withoutList = Array.isArray(metadata?.recipientsWithoutAttachment)
        ? metadata.recipientsWithoutAttachment.filter((entry): entry is string => typeof entry === "string")
        : [];
      const attachmentError = metaString(metadata, "attachmentError");

      const parts: string[] = [kindLabel];
      if (mapTitle) parts.push(mapTitle);

      if (withAttachment && withList.length > 0) {
        const fileLabel = filename ? filename : ".ocd-fil";
        parts.push(`med bifogad ${fileLabel} till ${withList.join(", ")}`);
      } else if (attachmentError) {
        parts.push(`bilaga misslyckades (${attachmentError})`);
      } else if (withList.length === 0 && withoutList.length > 0) {
        parts.push("utan bifogad fil");
      }

      if (withoutList.length > 0) {
        parts.push(`övriga mottagare: ${withoutList.join(", ")}`);
      }

      return parts.join(" — ");
    }
    case "PASSWORD_RESET_REQUESTED": {
      const email = metaString(metadata, "email");
      return email ? `Lösenordsåterställning begärd — ${email}` : "Lösenordsåterställning begärd";
    }
    case "PASSWORD_CHANGED": {
      const email = metaString(metadata, "email");
      const forced = metadata?.forced === true;
      const prefix = forced ? "Lösenord bytt efter tillfälligt lösenord" : "Lösenord bytt";
      return email ? `${prefix} — ${email}` : prefix;
    }
    case "SUGGESTION_CREATED": {
      const ref = mapRef(metadata);
      const category = metaString(metadata, "categoryLabel");
      if (ref && category) return `Kartförslag skapat — ${ref}, ${category}`;
      return ref ? `Kartförslag skapat — ${ref}` : "Kartförslag skapat";
    }
    case "SUGGESTION_UPDATED":
      return "Kartförslag uppdaterat";
    case "SUGGESTION_REVIEWED": {
      const status = metaString(metadata, "statusLabel");
      return status ? `Kartförslag granskat — ${status}` : "Kartförslag granskat";
    }
    case "SUGGESTION_DELETED":
      return "Kartförslag raderat";
    default:
      return action;
  }
}
