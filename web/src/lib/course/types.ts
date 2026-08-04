export const CourseObjectType = {
  POINT: "POINT",
  LINE: "LINE",
  AREA: "AREA",
  TEXT: "TEXT",
} as const;

export type CourseObjectTypeValue =
  (typeof CourseObjectType)[keyof typeof CourseObjectType];

export type CoursePointGeometry = {
  type: "Point";
  coordinates: [number, number];
  /** 704 only: 1-based index among 703 controls in visit order. */
  linkedControlIndex?: number;
};

export type CourseGeometry =
  | CoursePointGeometry
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export type CourseObjectInput = {
  id?: string;
  symbolNr: number;
  objectType: CourseObjectTypeValue;
  geometry: CourseGeometry;
  textContent?: string | null;
  sortOrder: number;
};

export type CourseObjectDto = CourseObjectInput & {
  id: string;
};

export type CourseSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  objectCount: number;
};

export type CourseDetail = CourseSummary & {
  objects: CourseObjectDto[];
};

export type EditorTool = "draw" | "move" | "delete";

export type EditorObject = CourseObjectDto & {
  /** Client-only temp id before first save */
  clientId: string;
};
