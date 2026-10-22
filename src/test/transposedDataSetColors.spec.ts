import { getCompositionRoot } from "../CompositionRoot";
import { DataSetGenerated03, DataSetGenerated04 } from "../data/templates";
import { Template } from "../domain/entities/Template";
import { Theme } from "../domain/entities/Theme";
import Settings from "../webapp/logic/settings";
import { SheetBuilder } from "../webapp/logic/sheetBuilder";
import { buildDataSetParams, DataSetParamsOptions } from "./fixtures/dataSetLayouts";
import { initializeMockServer } from "./mocks/server";

/*
    Color logic of the transposed layout. Rows (from row 10):
        10: DEA (default combo)   11: DEC (default combo)
        12-13: DEB (female, male) 14-15: DED (female, male)
*/

const { api } = initializeMockServer();
const compositionRoot = getCompositionRoot({
    appConfig: { appKey: "bulk-load", storage: "dataStore" },
    dhisInstance: { type: "local", url: api.baseUrl },
    mockApi: api,
});

const template = new DataSetGenerated04();
const rowTemplate = new DataSetGenerated03();
const sheetName = "Data Entry";

type Fill = { type: string; color?: { rgb?: string } } | undefined;

describe("Transposed data set colors", () => {
    let settings: Settings;

    beforeAll(async () => {
        settings = await Settings.build(api, compositionRoot);
    });

    async function generate(options?: DataSetParamsOptions, layoutTemplate: Template = template) {
        const workbook = await new SheetBuilder(buildDataSetParams(settings, layoutTemplate, options)).generate();
        const sheet = workbook.xworkbook.sheet(sheetName);
        const fill = (ref: string) => (sheet.cell(ref).style("fill") as Fill)?.color?.rgb;
        const fontColor = (ref: string) => sheet.cell(ref).style("fontColor") as { rgb?: string } | undefined;
        return { fill, fontColor };
    }

    it("uses one color per data element when the data set has no sections", async () => {
        const { fill } = await generate();

        // Same data element, different combos -> same color
        expect(fill("A12")).toEqual(fill("A13"));
        expect(fill("B12")).toEqual(fill("B13"));
        expect(fill("A12")).toEqual(fill("B12"));
        expect(fill("A14")).toEqual(fill("A15"));

        // Consecutive data elements -> different colors
        const colors = [fill("A10"), fill("A11"), fill("A12"), fill("A14")];
        expect(new Set(colors).size).toEqual(4);
    });

    it("uses one color per section when the data set has sections", async () => {
        const { fill } = await generate({
            sections: [
                { id: "S1", sortOrder: 1, dataElements: [{ id: "DEA" }, { id: "DEC" }] },
                { id: "S2", sortOrder: 2, dataElements: [{ id: "DEB" }, { id: "DED" }] },
            ],
        });

        expect(fill("A10")).toEqual(fill("A11"));
        expect(fill("A12")).toEqual(fill("A15"));
        expect(fill("B13")).toEqual(fill("A14"));
        expect(fill("A10")).not.toEqual(fill("A12"));
    });

    it("uses the palette of the selected theme", async () => {
        const theme = new Theme({ palette: ["#112233", "#445566"] });
        const { fill } = await generate({ theme });

        expect(fill("A10")).toEqual("112233");
        expect(fill("A11")).toEqual("445566");
        expect(fill("A12")).toEqual("112233");
    });

    it("hides the name of the default category option combo with the row color", async () => {
        const { fill, fontColor } = await generate();

        // Default combo (row 10): font color = background color
        expect(fontColor("B10")?.rgb).toEqual(fill("B10"));
        // Other combos keep a readable font
        expect(fontColor("B12")?.rgb).not.toEqual(fill("B12"));
    });

    it("alternates the shading of the entry columns", async () => {
        const { fill } = await generate();

        expect(fill("C10")).not.toEqual(fill("D10"));
        expect(fill("C10")).toEqual(fill("E10"));
        expect(fill("C15")).toEqual(fill("C10"));
        expect(fill("C5")).toEqual(fill("C10"));
        expect(fill("D5")).toEqual(fill("D10"));
    });

    /*
        Row layout (data elements as columns), same design. Data elements in row 4 (merged over their
        combos), combos in row 5, from column E: DEA=E, DEC=F, DEB=G,H, DED=I,J. Labels in A5:D5.
    */
    describe("row layout (data elements as columns)", () => {
        const generateRows = (options?: DataSetParamsOptions) => generate(options, rowTemplate);

        it("uses one color per data element when the data set has no sections", async () => {
            const { fill } = await generateRows();

            expect(fill("G4")).toEqual(fill("G5"));
            expect(fill("G5")).toEqual(fill("H5"));
            expect(fill("I4")).toEqual(fill("J5"));
            expect(new Set([fill("E4"), fill("F4"), fill("G4"), fill("I4")]).size).toEqual(4);
        });

        it("uses one color per section when the data set has sections", async () => {
            const { fill } = await generateRows({
                sections: [
                    { id: "S1", sortOrder: 1, dataElements: [{ id: "DEA" }, { id: "DEC" }] },
                    { id: "S2", sortOrder: 2, dataElements: [{ id: "DEB" }, { id: "DED" }] },
                ],
            });

            expect(fill("E4")).toEqual(fill("F5"));
            expect(fill("G4")).toEqual(fill("J5"));
            expect(fill("E4")).not.toEqual(fill("G4"));
        });

        it("uses the palette of the selected theme", async () => {
            const { fill } = await generateRows({ theme: new Theme({ palette: ["#112233", "#445566"] }) });

            expect(fill("E4")).toEqual("112233");
            expect(fill("F4")).toEqual("445566");
        });

        it("hides the default category option combo name and tints the labels", async () => {
            const { fill, fontColor } = await generateRows();

            expect(fontColor("E5")?.rgb).toEqual(fill("E5"));
            expect(fontColor("G5")?.rgb).not.toEqual(fill("G5"));
            expect(new Set([fill("A5"), fill("B5"), fill("C5"), fill("D5")])).toEqual(new Set(["E8EDF5"]));
        });

        it("uses the same colors and label tint as the transposed layout", async () => {
            const rows = await generateRows();
            const transposed = await generate();

            // DEA, DEC, DEB, DED -> same group colors
            expect(rows.fill("E4")).toEqual(transposed.fill("A10"));
            expect(rows.fill("F4")).toEqual(transposed.fill("A11"));
            expect(rows.fill("G4")).toEqual(transposed.fill("A12"));
            expect(rows.fill("I4")).toEqual(transposed.fill("A14"));
            // Labels
            expect(rows.fill("A5")).toEqual(transposed.fill("A5"));
        });
    });
});
