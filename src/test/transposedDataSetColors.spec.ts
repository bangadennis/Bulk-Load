import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated03, DataSetGenerated04 } from "../data/templates";
import { Template } from "../domain/entities/Template";
import { Theme } from "../domain/entities/Theme";
import Settings from "../webapp/logic/settings";
import { SheetBuilder } from "../webapp/logic/sheetBuilder";
import { buildDataSetParams, DataSetParamsOptions } from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    The transposed layout (data elements as rows) has the same plain design as the row layout (data elements
    as columns): one color per data set section (per data element without sections, theme palette or default colors),
    hidden default combo names,
    plain labels and plain entry cells. Rows of the transposed layout (from row 10):
        10: DEA (default combo)   11: DEC (default combo)
        12-13: DEB (female, male) 14-15: DED (female, male)
    Row layout: data elements in row 4 (merged over their combos), combos in row 5, from column E:
        DEA=E, DEC=F, DEB=G,H, DED=I,J.
*/

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const transposedTemplate = new DataSetGenerated04();
const rowTemplate = new DataSetGenerated03();
const sheetName = "Data Entry";

type Fill = { type: string; color?: { rgb?: string } } | undefined;

describe("Transposed data set design (same as the row layout)", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    async function generate(template: Template, options?: DataSetParamsOptions) {
        const workbook = await new SheetBuilder(buildDataSetParams(settings, template, options)).generate();
        const sheet = workbook.xworkbook.sheet(sheetName);
        const fill = (ref: string) => (sheet.cell(ref).style("fill") as Fill)?.color?.rgb;
        const fontColor = (ref: string) => sheet.cell(ref).style("fontColor") as { rgb?: string } | undefined;
        const border = (ref: string) => sheet.cell(ref).style("borderStyle");
        return { fill, fontColor, border };
    }

    it("uses one color per data element", async () => {
        const { fill } = await generate(transposedTemplate);

        // Same data element, different combos -> same color
        expect(fill("A12")).toEqual(fill("A13"));
        expect(fill("B12")).toEqual(fill("B13"));
        expect(fill("A12")).toEqual(fill("B12"));
        expect(fill("A14")).toEqual(fill("A15"));

        // Different data elements -> different colors
        expect(new Set([fill("A10"), fill("A11"), fill("A12"), fill("A14")]).size).toEqual(4);
    });

    it("uses one color per section when the data set has sections", async () => {
        const { fill } = await generate(transposedTemplate, {
            sections: [
                { id: "S1", sortOrder: 1, dataElements: [{ id: "DEA" }, { id: "DEC" }] },
                { id: "S2", sortOrder: 2, dataElements: [{ id: "DEB" }, { id: "DED" }] },
            ],
        });

        // Same section -> same color (data elements, combos), different sections -> different colors
        expect(fill("A10")).toEqual(fill("A11"));
        expect(fill("A12")).toEqual(fill("A15"));
        expect(fill("B13")).toEqual(fill("A14"));
        expect(fill("A10")).not.toEqual(fill("A12"));
    });

    it("colors by section order, and data elements outside the sections have their own color", async () => {
        const { fill } = await generate(transposedTemplate, {
            sections: [
                { id: "S2", sortOrder: 2, dataElements: [{ id: "DEB" }] },
                { id: "S1", sortOrder: 1, dataElements: [{ id: "DEA" }] },
            ],
        });
        const palette = (await generate(transposedTemplate)).fill;

        // Rows follow the section order (S1: DEA, S2: DEB), then the data elements outside the sections
        // (DEC, DED): 10 = DEA, 11-12 = DEB, 13 = DEC, 14-15 = DED. Colors are the 1st, 2nd and 3rd of the palette
        // (the rows without sections are DEA, DEC, DEB: 10, 11, 12)
        expect(fill("A10")).toEqual(palette("A10"));
        expect(fill("A11")).toEqual(palette("A11"));
        expect(fill("B12")).toEqual(fill("A11"));
        expect(fill("A13")).toEqual(palette("A12"));
        expect(fill("A14")).toEqual(fill("A13"));
        expect(fill("A15")).toEqual(fill("A13"));
        expect(new Set([fill("A10"), fill("A11"), fill("A13")]).size).toEqual(3);
    });

    it("uses the palette of the selected theme", async () => {
        const { fill } = await generate(transposedTemplate, { theme: new Theme({ palette: ["#112233", "#445566"] }) });

        expect(fill("A10")).toEqual("112233");
        expect(fill("A11")).toEqual("445566");
        expect(fill("A12")).toEqual("112233");
    });

    it("hides the name of the default category option combo with the row color", async () => {
        const { fill, fontColor } = await generate(transposedTemplate);

        expect(fontColor("B10")?.rgb).toEqual(fill("B10"));
        expect(fontColor("B12")?.rgb).not.toEqual(fill("B12"));
    });

    it("has plain labels and plain entry cells", async () => {
        const { fill, border } = await generate(transposedTemplate);

        // Labels (org unit, period, attribute, completed) have the base style (white)
        expect(new Set([fill("A5"), fill("A6"), fill("A7"), fill("A8")]).size).toEqual(1);
        expect(fill("A5")?.toLowerCase()).toEqual("ffffff");
        // Entry cells: header and data cells have no fill nor borders
        for (const ref of ["C5", "D6", "C8", "C10", "D12", "CV15"]) {
            expect(fill(ref)).toBeUndefined();
            expect(Object.values(border(ref) ?? {}).filter(Boolean)).toEqual([]);
        }
    });

    it("uses the same colors and labels as the row layout", async () => {
        const rows = await generate(rowTemplate);
        const transposed = await generate(transposedTemplate);

        // DEA, DEC, DEB, DED -> same colors
        expect(transposed.fill("A10")).toEqual(rows.fill("E4"));
        expect(transposed.fill("A11")).toEqual(rows.fill("F4"));
        expect(transposed.fill("A12")).toEqual(rows.fill("G4"));
        expect(transposed.fill("A14")).toEqual(rows.fill("I4"));
        // Labels
        expect(transposed.fill("A5")).toEqual(rows.fill("A5"));
    });
});
