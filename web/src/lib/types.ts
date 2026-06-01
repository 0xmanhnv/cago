// DTO shapes mirroring cago/utils/dto.py. Optional fields appear only for the
// audiences (public/staff/owner) that the server includes them for.

export type ExpiryStatus = "ok" | "near" | "expired";

export interface ProductCard {
  item_code: string;
  display_name: string;
  image?: string | null;
  category?: string;
  category_icon?: string;
  category_color?: string;
  price_text: string;
  stock_status?: string | null;
  short_description?: string;
  is_chemical?: boolean;
  stock_auto?: boolean; // true = on-hand is tracked (so 0 means really out of stock)
  actual_stock_qty?: number | null; // real on-hand in stock units (null when not tracked)
}

export interface Product {
  item_code: string;
  display_name: string;
  category?: string;
  category_icon?: string;
  category_color?: string;
  image?: string | null;
  images?: string[];
  price_text: string;
  unit?: string;
  public_description?: string | null;
  use_cases?: string | null;
  package_color?: string | null;
  stock_status?: string | null;
  stock_auto?: boolean;
  is_chemical?: boolean;
  safety_notes?: string | null;
  // expiry (Phase 1)
  nearest_expiry?: string | null;
  expiry_text?: string | null;
  expiry_status?: ExpiryStatus;
  // multi-UOM retail selling (Bao / Kg / Lạng…)
  sale_units?: { uom: string; label?: string; price_text: string }[];
  // staff/owner-only
  official_name?: string;
  local_names?: string | null;
  selling_price?: number;
  actual_stock_qty?: number;
  shelf_location?: string | null;
  staff_advice?: string | null;
  crop_or_animal_targets?: string | null;
  quality_tier?: string | null;
  call_owner_when?: string | null;
  alternatives?: Record<string, { item_code: string; display_name: string; note?: string }[]>;
}

export interface Category {
  category: string;
  count: number;
  icon: string;
  color: string;
  sort?: number;
  children?: Category[]; // sub-categories (parent → child); empty/absent for a flat shop
}

export interface KioskChips {
  product: string[];
  category: string[];
  general: string[];
}

export interface ChatResponse {
  answer_text: string;
  product_cards: ProductCard[];
  safety_warnings: string[];
  needs_staff_help: boolean;
  sources: string[];
  confidence: "low" | "high";
}

export interface Persona {
  name: string;
  pronoun: string;
  owner: string;
  relation: string;
  tagline: string;
}

export interface Bootstrap {
  user: string;
  full_name?: string;
  is_guest: boolean;
  roles: string[];
  csrf_token: string;
  brand: string;
  persona: Persona;
  kiosk_chips: KioskChips;
  kiosk_debt_visible: boolean;
  allow_price_edit: boolean;
  has_posawesome: boolean;
  pos_url?: string | null;
}

export interface Batch {
  batch: string;
  batch_id: string;
  item_code: string;
  display_name: string;
  expiry_date?: string | null;
  expiry_text?: string | null;
  manufacturing_date?: string | null;
  expiry_status: ExpiryStatus;
  days_left?: number | null;
  qty: number;
  sell_first?: boolean;
}
