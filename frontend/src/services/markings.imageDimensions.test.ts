/**
 * issues.md 167 / Trello T37 -- stored image dimensions must reach the client.
 *
 * The cover-shape classifier (lib/imageShape.ts) decides whether a picture
 * shows a whole cover or a marking closeup, from pixel dimensions alone. It is
 * wired into the upload forms, where the browser measures a File. To offer the
 * same nudge over images ALREADY in the catalog there is no File to measure --
 * the dimensions have to come from the API.
 *
 * ImageSerializer has always sent image_width and image_height. The frontend
 * threw them away.
 *
 * There are TWO image mappers in this module and they are easy to miss:
 * mapImageRow feeds getImagesForSubject and the upload response, mapImage feeds
 * mapApiMarkingToRecord. Populating one and not the other yields a silent
 * `undefined`, a classifier that quietly returns "indeterminate", and a feature
 * that simply never prompts. One test per mapper, deliberately.
 */
import { getImagesForSubject, mapApiMarkingToRecord } from "./markings";
import apiClient from "@/lib/api";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  ensureCsrfToken: jest.fn(),
}));

const mockedGet = apiClient.get as jest.Mock;

const apiImage = (over: Record<string, unknown> = {}) => ({
  image_id: 5869,
  subject_type: "MARKING",
  subject_id: 31110,
  image_url: "/media/va/scan.png",
  image_view: "FULL",
  original_filename: "scan.png",
  storage_filename: "va/scan.png",
  image_description: "",
  is_tracing: false,
  display_order: 0,
  image_width: 1600,
  image_height: 1200,
  ...over,
});

describe("image dimensions reach the client", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("carries width and height through mapApiMarkingToRecord", () => {
    const record = mapApiMarkingToRecord({
      id: 31110,
      images: [apiImage()],
      main_image: apiImage(),
    });

    expect(record.images[0].imageWidth).toBe(1600);
    expect(record.images[0].imageHeight).toBe(1200);
    // main_image goes through the same mapper by a different route.
    expect(record.mainImage?.imageWidth).toBe(1600);
  });

  it("carries width and height through getImagesForSubject", async () => {
    mockedGet.mockResolvedValue({ data: { results: [apiImage()] } });

    const images = await getImagesForSubject({ subjectType: "MARKING", subjectId: 31110 });

    expect(images[0].imageWidth).toBe(1600);
    expect(images[0].imageHeight).toBe(1200);
  });

  it("reports a legacy row with no recorded dimensions as zero, not NaN", async () => {
    // contribution_apply writes `int(meta.get("image_width") or 0)`, so rows
    // genuinely carry 0. classifyImageShape treats a non-positive dimension as
    // indeterminate, which is the right outcome: no prompt on unknown data.
    mockedGet.mockResolvedValue({
      data: { results: [apiImage({ image_width: null, image_height: undefined })] },
    });

    const images = await getImagesForSubject({ subjectType: "MARKING", subjectId: 31110 });

    expect(images[0].imageWidth).toBe(0);
    expect(images[0].imageHeight).toBe(0);
  });
});
