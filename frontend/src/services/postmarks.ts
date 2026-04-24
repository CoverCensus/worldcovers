import apiClient from "@/lib/api";

export interface PostmarkApiResponse {
    /** Total count; null when include_count=false for faster response */
    count: number | null;
    next: string | null;
    previous: string | null;
    results: any | [];
    /** True when count was capped for performance (e.g. 10,001+) */
    count_capped?: boolean;
  }
  
  /** API list: `{ id, name }` for primary color when present. */
  export interface PostmarkIdNameRef {
    id: number;
    name: string;
  }

  /** Normalized postmark for list/detail (matches API shape) */
  export interface PostmarkRecord {
    id: number;
    postmarkKey: string;
    facilityName: string;
    shapeName: string;
    rateLocation: string;
    rateValue: string;
    state: string,
    regionAbbrev: string,
    dateRange: string,
    town: string,
    sizeDisplay?: string,
    isManuscript: boolean;
    /** List/detail: string URL or image object from API (`image_url`, etc.) */
    mainImage: string | Record<string, unknown> | null;
    responsibleGroups: unknown[];
    catalogTxt?: string;
    inscriptionTxt?: string;
    letteringStyleName?: string;
    framing?: string;
    postmarkTextCombined?: string;
    postmarkTextVariations?: string[];
    /** v2 list: `shape` (postmark shape display) */
    listingShape?: string;
    shapeLetteringDisplay?: string;
    dimensionsDisplay?: string;
    datesSeenDisplay?: string;
    earliestUse?: string;
    latestUse?: string;
    color?: PostmarkIdNameRef | null;
    ratemarkCount?: number;
    auxmarkCount?: number;
  }

  /** v2 postmark-ratemarks/?postmark=<id> row (enriched with nested ratemark + auxmark count). */
  export interface AssociatedRatemark {
    id: number;
    postmark: number;
    ratemark: number;
    placementType: string | null;
    auxmarkCount: number;
    ratemarkDetails: {
      id: number;
      code?: string | null;
      inscriptionTxt?: string | null;
      rateVal?: string | number | null;
      impression?: string | null;
      width?: number | string | null;
      height?: number | string | null;
      isManuscript?: boolean;
      isIrreg?: boolean | null;
      shapeName?: string | null;
      letteringName?: string | null;
      colorName?: string | null;
      [k: string]: unknown;
    } | null;
  }

  /** v2 auxmarks/?parent_mark_type=POSTMARK&parent_mark_id=<id> row. */
  export interface AssociatedAuxmark {
    id: number;
    code?: string | null;
    parentMarkType: string;
    parentMarkId: number;
    inscriptionTxt?: string | null;
    impression?: string | null;
    width?: number | string | null;
    height?: number | string | null;
    isManuscript?: boolean;
    shapeName?: string | null;
    letteringName?: string | null;
    colorName?: string | null;
    [k: string]: unknown;
  }

  /** v2 cover-postmarks/?postmark=<id> row (enriched with nested cover). */
  export interface AssociatedCover {
    id: number;
    cover: number;
    postmark: number;
    isBackstamp: boolean;
    coverDetails: {
      id: number;
      code?: string | null;
      colorName?: string | null;
      type?: string | null;
      hasAdhesive?: boolean | null;
      width?: number | string | null;
      height?: number | string | null;
      isInstitutional?: boolean | null;
      [k: string]: unknown;
    } | null;
  }
  
  /**
   * Human-readable dimensions for catalog/detail views.
   * Contributions often store a free-text value in size_notes with width/height = 0
   * (see backend PostmarkSize create from contributions).
   * Matches backend PostmarkListSerializer.get_size_display behavior.
   */
  export function formatPostmarkDimensionsDisplay(sizes: unknown): string {
    if (!Array.isArray(sizes) || sizes.length === 0) return "";

    const parsePositive = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    };

    const fmtNum = (n: number) => {
      const t = n.toFixed(2).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
      return t;
    };

    const sorted = [...sizes].sort((a, b) => {
      const da = (a as any)?.created_date ?? (a as any)?.createdDate ?? "";
      const db = (b as any)?.created_date ?? (b as any)?.createdDate ?? "";
      return String(db).localeCompare(String(da));
    });

    const s = sorted[0] as Record<string, unknown> | undefined;
    if (!s) return "";

    const w = parsePositive(s.width);
    const h = parsePositive(s.height);
    const notes = String(s.size_notes ?? s.sizeNotes ?? "").trim();

    if (w != null && h != null) return `${fmtNum(w)}×${fmtNum(h)} mm`;
    if (w != null) return `${fmtNum(w)} mm`;
    if (h != null) return `${fmtNum(h)} mm`;
    if (notes) {
      if (/mm|×|\bcm\b|x/i.test(notes)) return notes;
      return `${notes} mm`;
    }
    return "";
  }

export interface PostmarkChangelogEvent {
  event_id: number;
  transaction_uuid: string;
  timestamp: string;
  action: string;
  action_label: string;
  actor: string | null;
  source: string;
  contribution_id: number | null;
  version_no: number | null;
  summary: string;
  diff: Array<{ field: string; before: unknown; after: unknown }>;
}

export interface PostmarkVersionRow {
  version_no: number;
  created_at: string;
  created_by: string | null;
  transaction_id: number | null;
  action?: string | null;
  action_label?: string | null;
  snapshot?: {
    catalog_txt?: string;
    code?: string;
    town?: string;
    state?: string;
    inscription_txt?: string;
    is_manuscript?: boolean;
    impression?: string;
    is_irreg?: boolean | null;
    shape_id?: number | null;
    lettering_id?: number | null;
    color_id?: number | null;
    date_type?: string;
    date_fmt?: string;
    width?: number | string | null;
    height?: number | string | null;
    dates_observed?: string[];
  };
}

export interface PostmarkChangelogResponse {
  postmark_id: number;
  events: PostmarkChangelogEvent[];
  versions: PostmarkVersionRow[];
  approved_versions?: PostmarkVersionRow[];
}

  /** Normalize image URL to absolute using the API origin when needed. */
  export function normalizeImageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    // Already absolute
    if (/^https?:\/\//i.test(path)) return path;
    const base = apiClient.defaults.baseURL;
    if (!base || !/^https?:\/\//i.test(base)) return path;
    try {
      const url = new URL(base);
      const relative = path.startsWith("/") ? path : `/${path}`;
      return `${url.origin}${relative}`;
    } catch {
      return path;
    }
  }
  
  function parseIdNameRef(raw: unknown): PostmarkIdNameRef | null | undefined {
    if (raw == null) return undefined;
    if (typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    const id = o.id ?? o.color_id ?? o.colorId;
    const name = o.name ?? o.color_name ?? o.colorName;
    if (id == null && name == null) return null;
    const idNum = typeof id === "number" ? id : parseInt(String(id), 10);
    if (!Number.isFinite(idNum)) return null;
    return { id: idNum, name: String(name ?? "") };
  }

  /** Resolved image URL for catalog list cards (handles API `main_image` object or string). */
  export function getPostmarkListImageUrl(
    mainImage: PostmarkRecord["mainImage"]
  ): string | null {
    if (mainImage == null) return null;
    if (typeof mainImage === "string") return mainImage || null;
    const o = mainImage as Record<string, unknown>;
    const url = o.image_url ?? o.imageUrl ?? o.url;
    if (typeof url === "string" && url.length > 0) return url;
    return null;
  }

  /**
   * Maps GET /postmarks/{id}/ detail JSON to the same {@link PostmarkRecord} shape as list results,
   * so catalog field blocks stay consistent on the record page.
   */
  export function mapPostmarkDetailApiToPostmarkRecord(data: any): PostmarkRecord {
    try {
      return mapPostmarkDetailApiToPostmarkRecordImpl(data);
    } catch (e) {
      console.error("mapPostmarkDetailApiToPostmarkRecord", e);
      return mapApiResultToRecord({
        postmark_id: data?.postmark_id ?? data?.postmarkId,
        postmark_key: data?.postmark_key ?? data?.postmarkKey ?? data?.code ?? "",
        facility_name: data?.facility_name ?? data?.facilityName,
        shape_name: "",
        town: data?.town ?? "",
        state: data?.state ?? "",
        date_range: data?.date_range ?? data?.dateRange ?? "",
        color: data?.color,
        catalog_txt: data?.catalog_txt ?? data?.catalogTxt ?? "",
        inscription_txt: data?.inscription_txt ?? data?.inscriptionTxt ?? "",
        rate_location: data?.rate_location ?? data?.rateLocation ?? "",
        rate_value: data?.rate_value ?? data?.rateValue ?? "",
        is_manuscript: data?.is_manuscript ?? data?.isManuscript ?? false,
        main_image: data?.main_image ?? data?.mainImage ?? null,
        responsible_groups: data?.responsible_groups ?? data?.responsibleGroups ?? [],
        sizes: data?.sizes,
      });
    }
  }

  function mapPostmarkDetailApiToPostmarkRecordImpl(data: any): PostmarkRecord {
    const ps = data.postmark_shape ?? data.postmarkShape;
    const shapeName = ps?.shape_name ?? ps?.shapeName ?? "";
    const ls = data.lettering_style ?? data.letteringStyle;
    const letteringStyleName =
      (typeof ls === "object" && ls != null
        ? (ls as { lettering_style_name?: string }).lettering_style_name ??
          (ls as { letteringStyleName?: string }).letteringStyleName
        : undefined) ?? "";

    const editorialShape = data.shape;
    const editorialLettering = data.lettering;
    let shapeLetteringDisplay = "";
    if (typeof editorialShape === "object" && editorialShape != null && "name" in editorialShape) {
      const sp = String((editorialShape as { name?: string }).name ?? "");
      const lp =
        typeof editorialLettering === "object" && editorialLettering != null && "name" in editorialLettering
          ? String((editorialLettering as { name?: string }).name ?? "")
          : "";
      if (sp || lp) {
        shapeLetteringDisplay = lp ? `${sp} / ${lp}` : sp;
      }
    }

    const datesSeenArr = data.dates_seen ?? data.datesSeen ?? [];
    let earliestUse = "";
    let latestUse = "";
    if (Array.isArray(datesSeenArr) && datesSeenArr.length > 0) {
      const earliest = [...datesSeenArr].sort((a, b) => {
        const ea = String(a.earliest_date_seen ?? a.earliestDateSeen ?? "");
        const eb = String(b.earliest_date_seen ?? b.earliestDateSeen ?? "");
        return ea.localeCompare(eb);
      })[0];
      const latest = [...datesSeenArr].sort((a, b) => {
        const la = String(a.latest_date_seen ?? a.latestDateSeen ?? "");
        const lb = String(b.latest_date_seen ?? b.latestDateSeen ?? "");
        return lb.localeCompare(la);
      })[0];
      const ey = earliest?.earliest_date_seen ?? earliest?.earliestDateSeen;
      const ly = latest?.latest_date_seen ?? latest?.latestDateSeen;
      // Backend may return year-only bounds (YYYY-01-01 / YYYY-12-31) or real dates.
      // Preserve the full ISO date string when available.
      if (ey) earliestUse = String(ey);
      if (ly) latestUse = String(ly);
    }

    const inscriptionTxt = data.inscription_txt ?? data.inscriptionTxt ?? "";
    const catalogTxt = data.catalog_txt ?? data.catalogTxt ?? "";
    const insLines = String(inscriptionTxt).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const postmarkTextVariations = insLines.length > 0 ? insLines : undefined;
    const postmarkTextCombined =
      (data.postmark_text ?? data.postmarkText ?? "").trim() ||
      inscriptionTxt.trim() ||
      catalogTxt.trim() ||
      "";

    const dimensionsFromSizes = formatPostmarkDimensionsDisplay(data.sizes);
    const dateRange = data.date_range ?? data.dateRange ?? "";

    const mainImage =
      data.main_image ?? data.mainImage ?? (Array.isArray(data.images) && data.images.length > 0 ? data.images[0] : null);

    const synthetic = {
      postmark_id: data.postmark_id ?? data.postmarkId,
      postmark_key: data.postmark_key ?? data.postmarkKey ?? data.code,
      facility_name: data.facility_name ?? data.facilityName,
      shape_name: shapeName,
      town: data.town,
      state: data.state,
      date_range: dateRange,
      catalog_txt: catalogTxt,
      inscription_txt: inscriptionTxt,
      postmark_text: postmarkTextCombined,
      postmark_text_variations:
        data.postmark_text_variations ?? data.postmarkTextVariations ?? postmarkTextVariations,
      shape: data.shape ?? data.type ?? shapeName,
      shape_lettering: data.shape_lettering ?? data.shapeLettering ?? shapeLetteringDisplay,
      dimensions: data.dimensions ?? dimensionsFromSizes,
      dates_seen: data.dates_seen ?? data.datesSeen ?? dateRange,
      earliest_use: data.earliest_use ?? data.earliestUse ?? earliestUse,
      latest_use: data.latest_use ?? data.latestUse ?? latestUse,
      sizes: data.sizes,
      color: data.color,
      lettering_style: data.lettering_style ?? data.letteringStyle,
      framing_style: data.framing_style ?? data.framingStyle,
      rate_location: data.rate_location ?? data.rateLocation,
      rate_value: data.rate_value ?? data.rateValue,
      is_manuscript: data.is_manuscript ?? data.isManuscript,
      main_image: mainImage,
      responsible_groups: data.responsible_groups ?? data.responsibleGroups,
    };

    return mapApiResultToRecord(synthetic);
  }

  /** Prefer main_image; else first catalog image by display_order (GET detail / full list serializer). */
  function deriveMainImageFromApiItem(item: any): unknown {
    const m = item.main_image ?? item.mainImage;
    if (m != null) return m;
    const imgs = item.images;
    if (!Array.isArray(imgs) || imgs.length === 0) return null;
    const sorted = [...imgs].sort(
      (a, b) =>
        Number((a as { display_order?: number }).display_order ?? (a as { displayOrder?: number }).displayOrder ?? 0) -
        Number((b as { display_order?: number }).display_order ?? (b as { displayOrder?: number }).displayOrder ?? 0)
    );
    return sorted[0] ?? null;
  }

  /** Normalize API item (snake_case or camelCase) to PostmarkRecord. */
  function mapApiResultToRecord(item: any): PostmarkRecord {
    const id = item.postmark_id ?? item.postmarkId;
    const ps = item.postmark_shape ?? item.postmarkShape;
    const shapeNameFromNested =
      typeof ps === "object" && ps != null
        ? (ps as { shape_name?: string }).shape_name ??
          (ps as { shapeName?: string }).shapeName ??
          ""
        : "";
    const shapeName = (item.shape_name ?? item.shapeName ?? shapeNameFromNested ?? "").trim();

    const postOffice = item.post_office ?? item.postOffice;
    const postOfficeNameFromNested =
      typeof postOffice === "object" && postOffice != null
        ? (postOffice as { name?: string }).name ?? ""
        : "";
    const facilityName =
      (
        item.facility_name ??
        item.facilityName ??
        item.post_office_name ??
        item.postOfficeName ??
        postOfficeNameFromNested ??
        ""
      ).trim();

    const mainImage = deriveMainImageFromApiItem(item);
    const dateRange = item.date_range ?? item.dateRange;
    const sizeDisplayApi = item.size_display ?? item.sizeDisplay ?? item.sizeNotes;
    // Derive a human-readable size string from various possible fields
    let sizeDisplay: string | undefined = sizeDisplayApi || "";
    if (!sizeDisplay && Array.isArray(item.sizes) && item.sizes.length > 0) {
      sizeDisplay = formatPostmarkDimensionsDisplay(item.sizes) || undefined;
    }

    const ls = item.lettering_style ?? item.letteringStyle;
    const letteringStyleName =
      (typeof ls === "object" && ls != null
        ? (ls as { lettering_style_name?: string }).lettering_style_name ??
          (ls as { letteringStyleName?: string }).letteringStyleName
        : undefined) ?? item.lettering_style_name ?? item.letteringStyleName ?? "";

    const fs = item.framing_style ?? item.framingStyle;
    const framing =
      item.framing ??
      (typeof fs === "object" && fs != null
        ? (fs as { framing_style_name?: string }).framing_style_name ??
          (fs as { framingStyleName?: string }).framingStyleName
        : undefined) ?? item.framing_style_name ?? item.framingStyleName ?? "";

    const colorRefFromApi = parseIdNameRef(item.color);
    const colorsDisplay = String(item.colors_display ?? item.colorsDisplay ?? "").trim();
    const normalizedColor =
      colorRefFromApi !== undefined
        ? colorRefFromApi
        : colorsDisplay
          ? { id: -1, name: colorsDisplay }
          : undefined;

    return {
      id,
      postmarkKey: item.postmark_key ?? item.postmarkKey ?? item.code,
      facilityName: facilityName ?? "",
      shapeName: shapeName ?? "",
      rateLocation: item.rate_location ?? item.rateLocation,
      rateValue: item.rate_value ?? item.rateValue,
      isManuscript: item.is_manuscript ?? item.isManuscript,
      mainImage: (mainImage ?? null) as PostmarkRecord["mainImage"],
      state: item.state ?? "",
      regionAbbrev: (item.state_abbrev ?? item.stateAbbrev ?? item.region_abbrev ?? item.regionAbbrev ?? "").trim(),
      dateRange: dateRange ?? "",
      town: item.town ?? "",
      sizeDisplay,
      responsibleGroups: item.responsible_groups ?? item.responsibleGroups ?? [],
      catalogTxt: item.catalog_txt ?? item.catalogTxt ?? "",
      inscriptionTxt: item.inscription_txt ?? item.inscriptionTxt ?? "",
      letteringStyleName,
      framing,
      postmarkTextCombined: item.postmark_text ?? item.postmarkText ?? "",
      postmarkTextVariations: Array.isArray(item.postmark_text_variations)
        ? item.postmark_text_variations.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
        : Array.isArray(item.postmarkTextVariations)
          ? item.postmarkTextVariations.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
          : undefined,
      listingShape: item.shape ?? item.type ?? item.listingShape ?? item.listingType ?? shapeName,
      shapeLetteringDisplay: item.shape_lettering ?? item.shapeLettering ?? "",
      dimensionsDisplay: item.dimensions ?? item.dimensionsDisplay ?? "",
      datesSeenDisplay:
        (typeof item.dates_seen === "string" ? item.dates_seen : null) ??
        (typeof item.datesSeen === "string" ? item.datesSeen : null) ??
        dateRange ??
        "",
      earliestUse:
        item.earliest_use != null && item.earliest_use !== ""
          ? String(item.earliest_use)
          : item.earliestUse != null && item.earliestUse !== ""
            ? String(item.earliestUse)
            : "",
      latestUse:
        item.latest_use != null && item.latest_use !== ""
          ? String(item.latest_use)
          : item.latestUse != null && item.latestUse !== ""
            ? String(item.latestUse)
            : "",
      color: normalizedColor,
      ratemarkCount:
        typeof item.ratemark_count === "number"
          ? item.ratemark_count
          : typeof item.ratemarkCount === "number"
            ? item.ratemarkCount
            : undefined,
      auxmarkCount:
        typeof item.auxmark_count === "number"
          ? item.auxmark_count
          : typeof item.auxmarkCount === "number"
            ? item.auxmarkCount
            : undefined,
    };
  }

  /**
   * Fetches a single page of catalog entries for the current user's assigned states.
   * Used by state editors to manage (view, edit, delete) all catalog entries in their states.
   * Requires authentication; returns paginated results.
   * Optional filters match catalog list (state, town, shape/postmark_shape, color, search).
   */
  export async function getAssignedCatalogPage(
    page: number = 1,
    pageSize: number = 10,
    options?: {
      credentials?: RequestCredentials;
      filters?: { state?: string; town?: string; shape?: string; color?: string; search?: string };
    }
  ): Promise<GetPostmarksPageResult> {
    const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
    const f = options?.filters;
    if (f?.state && f.state !== "all") params.state = f.state;
    if (f?.town?.trim()) params.town = f.town.trim();
    if (f?.shape && f.shape !== "all") params.postmark_shape = f.shape;
    if (f?.color && f.color !== "all") params.color = f.color;
    if (f?.search?.trim()) params.search = f.search.trim();

    const res = await apiClient.get<PostmarkApiResponse>("/postmarks/my-assigned/", {
      params,
      withCredentials: true,
      headers: { Accept: "application/json" },
    });
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Assigned catalog API: invalid response (missing results array)");
    }
    return {
      results: data.results.map(mapApiResultToRecord),
      count: data.count ?? null,
      next: data.next ?? null,
      previous: data.previous ?? null,
      count_capped: data.count_capped,
    };
  }

  /**
   * Fetches a single postmark by ID from GET /postmarks/{postmarkId}/.
   * Returns null if the request fails.
   */
  export async function getPostmarkById(postmarkId: number): Promise<any | null> {
    try {
      const res = await apiClient.get(`/postmarks/${postmarkId}/`);
      return res.data;
    } catch {
      return null;
    }
  }

export async function getPostmarkChangelog(postmarkId: number): Promise<PostmarkChangelogResponse | null> {
  try {
    const res = await apiClient.get<PostmarkChangelogResponse>(`/postmarks/${postmarkId}/changelog/`, {
      withCredentials: true,
      headers: { Accept: "application/json" },
    });
    return res.data;
  } catch {
    return null;
  }
}

export async function restorePostmarkVersion(
  postmarkId: number,
  versionNo: number
): Promise<{ detail?: string; restored_from_version_no?: number; new_version_no?: number } | null> {
  try {
    const res = await apiClient.post(
      `/postmarks/${postmarkId}/restore-version/`,
      { version_no: versionNo },
      {
        withCredentials: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      }
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

  function unwrapResults<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data && Array.isArray(data.results)) return data.results as T[];
    return [];
  }

  /** Fetch PostmarkRatemark junctions for a postmark (enriched with nested ratemark_details + auxmark_count). */
  export async function getPostmarkRatemarks(postmarkId: number): Promise<AssociatedRatemark[]> {
    try {
      const res = await apiClient.get(`/postmark-ratemarks/`, {
        params: { postmark: postmarkId, page_size: 100 },
      });
      return unwrapResults<AssociatedRatemark>(res.data);
    } catch {
      return [];
    }
  }

  /** Fetch Auxmarks whose parent is this postmark (polymorphic parent_mark_type='POSTMARK'). */
  export async function getPostmarkAuxmarks(postmarkId: number): Promise<AssociatedAuxmark[]> {
    try {
      const res = await apiClient.get(`/auxmarks/`, {
        params: {
          parent_mark_type: "POSTMARK",
          parent_mark_id: postmarkId,
          page_size: 100,
        },
      });
      return unwrapResults<AssociatedAuxmark>(res.data);
    } catch {
      return [];
    }
  }

  /** Fetch CoverPostmark junctions for a postmark (enriched with nested cover_details). */
  export async function getPostmarkCovers(postmarkId: number): Promise<AssociatedCover[]> {
    try {
      const res = await apiClient.get(`/cover-postmarks/`, {
        params: { postmark: postmarkId, page_size: 100 },
      });
      return unwrapResults<AssociatedCover>(res.data);
    } catch {
      return [];
    }
  }

  /**
   * Returns the total number of postmark records from the paginated list endpoint.
   */
  export async function getPostmarkCount(): Promise<number> {
    const res = await apiClient.get<PostmarkApiResponse>("/postmarks/", {
      params: { page_size: "1" },
    });
    return typeof res.data.count === "number" ? res.data.count : 0;
  }

  export interface PostmarkYearRange {
    earliestYear: number | null;
    latestYear: number | null;
  }

  /**
   * Returns the overall earliest / latest year from any cataloged postmark's observed dates.
   */
  export async function getPostmarkYearRange(): Promise<PostmarkYearRange> {
    const res = await apiClient.get<Record<string, number | null | undefined>>(
      "/postmarks-range/"
    );
    const data = res.data ?? {};
    const earliest = data.earliestYear ?? data.earliest_year;
    const latest = data.latestYear ?? data.latest_year;
    return {
      earliestYear: typeof earliest === "number" ? earliest : null,
      latestYear: typeof latest === "number" ? latest : null,
    };
  }

  /**
   * Fetches postmarks from GET /postmarks/.
   */
  export async function getPostmarks(): Promise<PostmarkRecord[]> {
    const res = await apiClient.get<PostmarkApiResponse>("/postmarks/");
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Postmarks API: invalid response (missing results array)");
    }
    return data.results.map(mapApiResultToRecord);
  }
  
  /** Paginated result from getPostmarksPage */
  export interface GetPostmarksPageResult {
    results: PostmarkRecord[];
    /** Total count; null when include_count=false */
    count: number | null;
  next: string | null;
  previous: string | null;
    count_capped?: boolean;
  }
  
  /**
   * Fetches a single page of postmarks from api/postmarks/.
   * 10 records per page. Use page=2 for next 10 records.
   * Pass search to filter by keyword (postmark_key, facility_name, rate_value, etc).
   * Pass shapeId to filter by v2 common shape (sends shape=id to API).
   */
  export async function getPostmarksPage(
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    shapeId?: string | number,
    manuscripts?: "both" | "only" | "none" | boolean,
    color?: string,
    state?: string,
    town?: string,
    beginYear?: string,
    endYear?: string,
    hasImages?: boolean,
    /** When true, skips slow COUNT query for faster first load (count will be null) */
    deferCount?: boolean
  ): Promise<GetPostmarksPageResult> {
    const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
    if (search?.trim()) params.search = search.trim();
    if (shapeId != null && shapeId !== "" && String(shapeId) !== "all") {
      params.shape = String(shapeId);
    }
    // Back-compat: a true boolean means "exclude manuscripts" (previous signature).
    const manuscriptMode =
      typeof manuscripts === "boolean"
        ? manuscripts
          ? "none"
          : "both"
        : manuscripts ?? "both";
    if (manuscriptMode === "only") {
      params.is_manuscript = "true";
    } else if (manuscriptMode === "none") {
      params.is_manuscript = "false";
    }
    if (color !== "all" && color !== null && color !== "") {
      params.color = color;
    }
    if (state !== "all" && state != null && state !== "") {
      params.state = state.trim();
    }
    if (town != null && town.trim() !== "") {
      params.town = town.trim();
    }
    const begin = beginYear?.trim();
    if (begin !== undefined && begin !== "") {
      params.earliest_use_year_min = begin;
    }
    const end = endYear?.trim();
    if (end !== undefined && end !== "") {
      params.latest_use_year_max = end;
    }
    if (hasImages === true) {
      params.has_images = "true";
    }
    if (deferCount === true) {
      params.include_count = "false";
    }

    const res = await apiClient.get<PostmarkApiResponse>("/postmarks/", { params });
    const data = res.data;
    if (!Array.isArray(data.results)) {
      throw new Error("Postmarks API: invalid response (missing results array)");
    }

    return {
      results: data.results.map(mapApiResultToRecord),
      count: data.count,
      next: data.next,
      previous: data.previous,
      count_capped: data.count_capped,
    };
  }
