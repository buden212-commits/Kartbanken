export const CourseObjectType = {
  POINT: "POINT",
  LINE: "LINE",
  AREA: "AREA",
  TEXT: "TEXT",
} as const;

export type CourseObjectTypeValue =
  (typeof CourseObjectType)[keyof typeof CourseObjectType];

export type CourseCircleCutout = {
  /** Angle from control center (radians, geo space). */
  angleRad: number;
  /** Arc span; default ~45°. */
  spanRad?: number;
};

export type CourseLegGap = {
  /** Distance from line/control start along the leg (map units). */
  distance: number;
  /** Gap length (map units). */
  length: number;
};

export type CoursePointGeometry = {
  type: "Point";
  coordinates: [number, number];
  /** 704 only: 1-based index among 703 controls in visit order. */
  linkedControlIndex?: number;
  /** Gaps in control circle stroke (703, 706, 702). */
  cutouts?: CourseCircleCutout[];
  /** Gaps on auto-leg toward next control. */
  legGaps?: CourseLegGap[];
};

export type CourseLineGeometry = {
  type: "LineString";
  coordinates: [number, number][];
  /** Gaps along the line (705, 707). */
  gaps?: CourseLegGap[];
};

export type CourseGeometry =
  | CoursePointGeometry
  | CourseLineGeometry
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

export type EditorTool = "draw" | "move" | "delete" | "clip";

export type EditorObject = CourseObjectDto & {
  /** Client-only temp id before first save */
  clientId: string;
};
