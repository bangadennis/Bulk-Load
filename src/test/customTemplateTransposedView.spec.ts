import { DataSetGenerated03, DataSetGenerated04 } from "../data/templates";
import { ColumnDataSource } from "../domain/entities/Template";
import { getStringFromFile } from "../utils/files";
import { TemplateView, TemplateViewActions } from "../webapp/components/settings/templates/TemplateView";

/*
    Settings editor (basic mode) for custom templates: data sets with data elements as rows
    are saved as a "column" data source and loaded back to the same fields.
*/

const actions = new TemplateViewActions([], [new DataSetGenerated03(), new DataSetGenerated04()]);
const xlsx = new File(["content"], "template.xlsx");

const transposedFields: Partial<TemplateView> = {
    code: "MY_TRANSPOSED",
    name: "My transposed template",
    description: "Test",
    mode: "basic",
    dataFormType: "dataSets",
    dataFormId: "ds1",
    spreadsheet: xlsx,
    dataSetLayout: "dataElementsAsRows",
    orgUnitSheet: "Form",
    orgUnitRow: "3",
    periodSheet: "Form",
    periodRow: "4",
    attributeSheet: "Form",
    attributeRow: "5",
    completedSheet: "Form",
    completedRow: "",
    rangeSheet: "Form",
    rangeRowStart: "8",
    rangeColumnStart: "D",
    dataElementSheet: "Form",
    dataElementColumn: "A",
    categoryOptionSheet: "Form",
    categoryOptionColumn: "B",
    stylesTitleRange: "D2:I2",
    stylesSubtitleRange: "D3:I3",
    stylesLogoRange: "A2:C3",
};

async function buildView(fields: Partial<TemplateView>): Promise<TemplateView> {
    const base = await actions.build({ dataFormType: "dataSets" });
    return { ...base, ...fields, action: "create" };
}

describe("Custom template editor - data sets with data elements as rows", () => {
    it("lists the fields of the transposed layout", () => {
        const columns = actions.getFieldsForDataFormType("dataSets", "dataElementsAsColumns").flat();
        const rows = actions.getFieldsForDataFormType("dataSets", "dataElementsAsRows").flat();

        expect(columns).toContain("orgUnitColumn");
        expect(columns).not.toContain("orgUnitRow");
        expect(rows).toEqual(
            expect.arrayContaining([
                "orgUnitRow",
                "periodRow",
                "attributeRow",
                "completedRow",
                "dataElementColumn",
                "categoryOptionColumn",
                "rangeRowStart",
                "rangeColumnStart",
            ])
        );
        expect(rows).not.toContain("orgUnitColumn");
        expect(rows).not.toContain("dataElementRow");
    });

    it("validates the fields of the selected layout (completed row is optional)", async () => {
        const view = await buildView(transposedFields);
        const validation = actions.validate(view);
        expect(validation).toMatchObject({ isValid: true });

        const invalid = await buildView({ ...transposedFields, orgUnitRow: "C", dataElementColumn: "" });
        const invalidValidation = actions.validate(invalid);
        expect(invalidValidation.isValid).toBe(false);
    });

    it("saves a column data source and loads it back to the same fields", async () => {
        const view = await buildView({ ...transposedFields, completedRow: "6" });
        const validation = actions.validate(view);
        if (!validation.isValid) throw new Error(validation.errors.join(", "));

        const template = await actions.toCustomTemplate(validation.object);
        const [dataSource] = template.dataSources as ColumnDataSource[];

        expect(template.dataSources).toHaveLength(1);
        expect(dataSource).toEqual({
            type: "column",
            orgUnit: { type: "row", sheet: "Form", ref: 3 },
            period: { type: "row", sheet: "Form", ref: 4 },
            attribute: { type: "row", sheet: "Form", ref: 5 },
            completed: { type: "row", sheet: "Form", ref: 6 },
            range: { sheet: "Form", rowStart: 8, rowEnd: undefined, columnStart: "D" },
            dataElement: { type: "column", sheet: "Form", ref: "A" },
            categoryOption: { type: "column", sheet: "Form", ref: "B" },
        });

        const loaded = await actions.fromCustomTemplate(template);
        expect(loaded).toMatchObject({
            mode: "basic",
            dataSetLayout: "dataElementsAsRows",
            orgUnitSheet: "Form",
            orgUnitRow: 3,
            periodRow: 4,
            attributeRow: 5,
            completedRow: 6,
            rangeRowStart: 8,
            rangeColumnStart: "D",
            dataElementColumn: "A",
            categoryOptionColumn: "B",
        });
    });

    it("does not write the completed row when it is empty", async () => {
        const view = await buildView(transposedFields);
        const validation = actions.validate(view);
        if (!validation.isValid) throw new Error(validation.errors.join(", "));

        const template = await actions.toCustomTemplate(validation.object);
        const [dataSource] = template.dataSources as ColumnDataSource[];

        expect(dataSource && "completed" in dataSource).toBe(false);
    });

    it("keeps the row layout for data sets as before", async () => {
        const view = await buildView({
            ...transposedFields,
            dataSetLayout: "dataElementsAsColumns",
            orgUnitColumn: "A",
            periodColumn: "B",
            attributeColumn: "C",
            dataElementRow: "4",
            categoryOptionRow: "5",
            rangeRowStart: "6",
            rangeColumnStart: "E",
        });
        const validation = actions.validate(view);
        if (!validation.isValid) throw new Error(validation.errors.join(", "));

        const template = await actions.toCustomTemplate(validation.object);
        expect(template.dataSources?.map(ds => (typeof ds === "function" ? "function" : ds.type))).toEqual(["row"]);

        const loaded = await actions.fromCustomTemplate(template);
        expect(loaded).toMatchObject({ mode: "basic", dataSetLayout: "dataElementsAsColumns", orgUnitColumn: "A" });
    });

    it("starts from the data sources of the selected layout when the layout changes", async () => {
        const view = await buildView({
            mode: "advanced",
            dataFormType: "dataSets",
            dataSetLayout: "dataElementsAsColumns",
        });
        const updated = actions.update(view, "dataSetLayout", "dataElementsAsRows");

        expect(updated.dataSetLayout).toEqual("dataElementsAsRows");
        const json = updated.dataSources ? await getStringFromFile(updated.dataSources) : "[]";
        expect(JSON.parse(json)[0]).toMatchObject({ type: "column" });
    });
});
