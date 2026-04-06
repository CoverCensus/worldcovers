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
    colorsDisplay: string,
    state: string,
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
    framingStyleName?: string;
    postmarkTextCombined?: string;
    postmarkTextVariations?: string[];
    /** v2 list: `type` (shape type display) */
    listingType?: string;
    shapeLetteringDisplay?: string;
    dimensionsDisplay?: string;
    datesSeenDisplay?: string;
    earliestUse?: string;
    latestUse?: string;
    color?: PostmarkIdNameRef | null;
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

  /** Normalize image URL to absolute using the API origin when needed. */
  export function normalizeImageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    // Already absolute
    if (/^https?:\/\//i.test(path)) return path;
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) return path;
    try {
      const url = new URL(apiUrl);
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
        postmark_key: data?.postmark_key ?? data?.postmarkKey ?? "",
        facility_name: data?.facility_name ?? data?.facilityName,
        shape_name: "",
        town: data?.town ?? "",
        state: data?.state ?? "",
        date_range: data?.date_range ?? data?.dateRange ?? "",
        colors_display: data?.colors_display ?? data?.colorsDisplay ?? "",
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
      postmark_key: data.postmark_key ?? data.postmarkKey,
      facility_name: data.facility_name ?? data.facilityName,
      shape_name: shapeName,
      town: data.town,
      state: data.state,
      date_range: dateRange,
      colors_display: data.colors_display ?? data.colorsDisplay,
      catalog_txt: catalogTxt,
      inscription_txt: inscriptionTxt,
      postmark_text: postmarkTextCombined,
      postmark_text_variations:
        data.postmark_text_variations ?? data.postmarkTextVariations ?? postmarkTextVariations,
      type: data.type ?? shapeName,
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

    const pfi = item.postal_facility_identity ?? item.postalFacilityIdentity;
    const facilityNameFromNested =
      typeof pfi === "object" && pfi != null
        ? (pfi as { facility_name?: string }).facility_name ??
          (pfi as { facilityName?: string }).facilityName ??
          ""
        : "";
    const facilityName =
      (item.facility_name ?? item.facilityName ?? facilityNameFromNested ?? "").trim();

    const mainImage = deriveMainImageFromApiItem(item);
    const colorsDisplay = item.colors_display ?? item.colorsDisplay;
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
    const framingStyleName =
      (typeof fs === "object" && fs != null
        ? (fs as { framing_style_name?: string }).framing_style_name ??
          (fs as { framingStyleName?: string }).framingStyleName
        : undefined) ?? item.framing_style_name ?? item.framingStyleName ?? "";

    return {
      id,
      postmarkKey: item.postmark_key ?? item.postmarkKey,
      facilityName: facilityName ?? "",
      shapeName: shapeName ?? "",
      rateLocation: item.rate_location ?? item.rateLocation,
      rateValue: item.rate_value ?? item.rateValue,
      isManuscript: item.is_manuscript ?? item.isManuscript,
      mainImage: (mainImage ?? null) as PostmarkRecord["mainImage"],
      colorsDisplay: colorsDisplay ?? "",
      state: item.state ?? "",
      dateRange: dateRange ?? "",
      town: item.town ?? "",
      sizeDisplay,
      responsibleGroups: item.responsible_groups ?? item.responsibleGroups ?? [],
      catalogTxt: item.catalog_txt ?? item.catalogTxt ?? "",
      inscriptionTxt: item.inscription_txt ?? item.inscriptionTxt ?? "",
      letteringStyleName,
      framingStyleName,
      postmarkTextCombined: item.postmark_text ?? item.postmarkText ?? "",
      postmarkTextVariations: Array.isArray(item.postmark_text_variations)
        ? item.postmark_text_variations.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
        : Array.isArray(item.postmarkTextVariations)
          ? item.postmarkTextVariations.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
          : undefined,
      listingType: item.type ?? item.listingType ?? shapeName,
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
      color: parseIdNameRef(item.color),
    };
  }

  /**
   * Fetches a single page of catalog entries for the current user's assigned states.
   * Used by state editors to manage (view, edit, delete) all catalog entries in their states.
   * Requires authentication; returns paginated results.
   * Optional filters match catalog list (state, town, type/postmark_shape, color, search).
   */
  export async function getAssignedCatalogPage(
    page: number = 1,
    pageSize: number = 10,
    options?: {
      credentials?: RequestCredentials;
      filters?: { state?: string; town?: string; type?: string; color?: string; search?: string };
    }
  ): Promise<GetPostmarksPageResult> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
      return { results: [], count: 0, next: null, previous: null };
    }
    const base = apiUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const f = options?.filters;
    if (f?.state && f.state !== "all") params.set("state", f.state);
    if (f?.town?.trim()) params.set("town", f.town.trim());
    if (f?.type && f.type !== "all") params.set("postmark_shape", f.type);
    if (f?.color && f.color !== "all") params.set("color", f.color);
    if (f?.search?.trim()) params.set("search", f.search.trim());
    const url = `${base}/my-assigned/?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      credentials: options?.credentials ?? "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Assigned catalog API error: ${res.status} ${res.statusText}`);
    }
    const data: PostmarkApiResponse = await res.json();
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
  
  function getPostmarksApiUrl(): string | null {
    const env = import.meta.env.VITE_API_URL;
    if (!env || typeof env !== "string" || env.trim() === "") return null;
    const base = env.trim().replace(/\/+$/, "");
    if (base.endsWith("/postmarks")) return base;
    return `${base}/postmarks`;
  }
  
  /**
   * Fetches a single postmark by ID from GET /postmarks/{postmarkId}/.
   * Returns null if API is not configured or request fails.
   */
  export async function getPostmarkById(postmarkId: number): Promise<any | null> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) return null;
  
    const base = apiUrl.replace(/\/+$/, "");
    const url = `${base}/${postmarkId}/`;
    const res = await fetch(url);
    if (!res.ok) return null;
  
    const data = await res.json();
    return data;
  }
  
  /**
   * Fetches postmarks from GET /postmarks/.
   * When VITE_POSTMARKS_API_URL is not set, returns [] (app uses Supabase catalog_records).
   */
  export async function getPostmarks(): Promise<PostmarkRecord[]> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
      return [];
    }
  
    const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Postmarks API error: ${res.status} ${res.statusText}`);
    }
  
    const data: PostmarkApiResponse = await res.json();
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
   * Pass postmarkShapeId to filter by postmark type (sends postmark_shape=id to API).
   */
  export async function getPostmarksPage(
    page: number = 1,
    pageSize: number = 10,
    search?: string,
    postmarkShapeId?: string | number,
    excludeManuscripts?: boolean,
    color?: string,
    state?: string,
    town?: string,
    beginYear?: string,
    endYear?: string,
    hasImages?: boolean,
    /** When true, skips slow COUNT query for faster first load (count will be null) */
    deferCount?: boolean
  ): Promise<GetPostmarksPageResult> {
    const apiUrl = getPostmarksApiUrl();
    if (!apiUrl) {
    return { results: [], count: 0, next: null, previous: null };
    }
  
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search?.trim()) params.set("search", search.trim());
    if (postmarkShapeId != null && postmarkShapeId !== "" && String(postmarkShapeId) !== "all") {
      params.set("postmark_shape", String(postmarkShapeId));
    }
    if (excludeManuscripts) {
      params.set("is_manuscript", String(excludeManuscripts));
    }
    if (color !== "all" && color !== null && color !== "") {
      params.set("color", color);
    }
    if (state !== "all" && state != null && state !== "") {
      params.set("state", state.trim());
    }
    if (town != null && town.trim() !== "") {
      params.set("town", town.trim());
    }
    const begin = beginYear?.trim();
    if (begin !== undefined && begin !== "") {
      params.set("earliest_use_year_min", begin);
    }
    const end = endYear?.trim();
    if (end !== undefined && end !== "") {
      params.set("latest_use_year_max", end);
    }
    if (hasImages === true) {
      params.set("has_images", "true");
    }
    if (deferCount === true) {
      params.set("include_count", "false");
    }
    const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const url = `${base}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Postmarks API error: ${res.status} ${res.statusText}`);
    }
  
    const data: PostmarkApiResponse = await res.json();
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
