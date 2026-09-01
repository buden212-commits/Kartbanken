import {
  adminUserFlow,
  checkoutFlow,
  compareFlow,
  courseFlow,
  overviewSystem,
  publishFlow,
  roleHierarchy,
  suggestionSubmit,
  versionUpload,
} from "../../src/lib/help/process-diagrams";

/**
 * Diagrammen i kursmaterialet hämtas från samma källa som hjälpen i appen,
 * så att de aldrig hinner glida isär. Nyckeln matchar markören i markdown.
 */
export const courseDiagrams: Array<{ key: string; title: string; chart: string }> = [
  { key: "roller", title: "Roller — varje nivå inkluderar den under", chart: roleHierarchy },
  { key: "kartforslag", title: "Flöde — skicka in kartförslag", chart: suggestionSubmit },
  { key: "bana", title: "Flöde — lägg bana", chart: courseFlow },
  { key: "uppladdning", title: "Flöde — ladda upp ny version", chart: versionUpload },
  { key: "publicering", title: "Flöde — publicera version", chart: publishFlow },
  { key: "utcheckning", title: "Status — utcheckning till integrerad version", chart: checkoutFlow },
  { key: "jamforelse", title: "Flöde — jämföra versioner", chart: compareFlow },
  { key: "anvandare", title: "Flöde — användarhantering", chart: adminUserFlow },
  { key: "helhet", title: "Översikt — systemets huvudflöden", chart: overviewSystem },
];
