/**
 * Turning what people typed into something you can filter by.
 *
 * City is a free-text field at signup, so 168 trainers produced 96 distinct
 * strings. Bengaluru alone arrived as "banglore", "bangalore", "bengaluru",
 * "bengalore" and "bangaluru"; several people typed a state instead of a city,
 * one typed two cities, and one typed nonsense. A dropdown built straight off
 * that is unusable.
 *
 * So the raw value is never thrown away — it stays on the record — but every
 * read also carries a canonical { city, state } derived here.
 */

export interface CanonicalLocation {
  /** Title-cased city, or null when we only got a state (or nothing usable). */
  city: string | null;
  /** Indian state or union territory, or null when the city isn't one we know. */
  state: string | null;
  /** Exactly what was typed, trimmed. Kept so nothing is silently rewritten. */
  raw: string;
}

/** Lowercase, collapse whitespace, drop punctuation — the lookup key. */
const key = (value: string) =>
  value
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * City spellings we've actually received, mapped to one canonical city.
 *
 * Only aliases that appear in the data, plus the obvious near-misses. This is
 * not a gazetteer of India and should not become one — when a new spelling
 * turns up, add it here.
 */
const CITY_ALIASES: Record<string, string> = {
  banglore: "Bengaluru",
  bangalore: "Bengaluru",
  bengalore: "Bengaluru",
  bangaluru: "Bengaluru",
  benguluru: "Bengaluru",
  bengaluru: "Bengaluru",
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  "new delhi": "Delhi",
  delhi: "Delhi",
  "delhi ncr": "Delhi",
  vizag: "Visakhapatnam",
  visakhapatnam: "Visakhapatnam",
  "kanpur nagar": "Kanpur",
  kanpur: "Kanpur",
  ernakulam: "Kochi",
  kochi: "Kochi",
  cochin: "Kochi",
  nasik: "Nashik",
  nashik: "Nashik",
  bombay: "Mumbai",
  mumbai: "Mumbai",
  "mumbai virar": "Mumbai",
  calcutta: "Kolkata",
  kolkata: "Kolkata",
  madras: "Chennai",
  chennai: "Chennai",
  trivandrum: "Thiruvananthapuram",
  "varkala trivandrum kerala": "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram",
  pondicherry: "Puducherry",
  hubli: "Hubballi",
  hubballi: "Hubballi",
};

/** Canonical city → state. Everything we have seen, and nothing we haven't. */
const CITY_STATE: Record<string, string> = {
  // Andhra Pradesh
  Visakhapatnam: "Andhra Pradesh",
  Srikakulam: "Andhra Pradesh",
  Mangalagiri: "Andhra Pradesh",
  Tenali: "Andhra Pradesh",
  "East Godavari": "Andhra Pradesh",
  // Arunachal Pradesh
  "Tenga Valley": "Arunachal Pradesh",
  // Assam
  Guwahati: "Assam",
  // Bihar
  Buxar: "Bihar",
  Patna: "Bihar",
  // Chhattisgarh
  Bilaspur: "Chhattisgarh",
  Jagdalpur: "Chhattisgarh",
  Lormi: "Chhattisgarh",
  Raipur: "Chhattisgarh",
  // Delhi
  Delhi: "Delhi",
  // Gujarat
  Ahmedabad: "Gujarat",
  Vadodara: "Gujarat",
  Surat: "Gujarat",
  Rajkot: "Gujarat",
  // Haryana
  Faridabad: "Haryana",
  Gurugram: "Haryana",
  Hisar: "Haryana",
  Rohtak: "Haryana",
  Kalanaur: "Haryana",
  Narnaul: "Haryana",
  Panipat: "Haryana",
  // Himachal Pradesh
  Nahan: "Himachal Pradesh",
  Shimla: "Himachal Pradesh",
  // Jharkhand
  Ranchi: "Jharkhand",
  Jamshedpur: "Jharkhand",
  // Karnataka
  Bengaluru: "Karnataka",
  Hubballi: "Karnataka",
  Mysuru: "Karnataka",
  Mangaluru: "Karnataka",
  // Kerala
  Kochi: "Kerala",
  Kannur: "Kerala",
  Kottayam: "Kerala",
  Malappuram: "Kerala",
  Chelembra: "Kerala",
  Thiruvananthapuram: "Kerala",
  Kozhikode: "Kerala",
  Thrissur: "Kerala",
  // Madhya Pradesh
  Indore: "Madhya Pradesh",
  Bhopal: "Madhya Pradesh",
  Jabalpur: "Madhya Pradesh",
  Ujjain: "Madhya Pradesh",
  Sagar: "Madhya Pradesh",
  Gwalior: "Madhya Pradesh",
  // Maharashtra
  Mumbai: "Maharashtra",
  Pune: "Maharashtra",
  Nagpur: "Maharashtra",
  Nashik: "Maharashtra",
  "Wadgaon Bk": "Maharashtra",
  Thane: "Maharashtra",
  // Punjab
  Jalandhar: "Punjab",
  Ludhiana: "Punjab",
  Patiala: "Punjab",
  Phagwara: "Punjab",
  Amritsar: "Punjab",
  Mohali: "Punjab",
  // Rajasthan
  Jaipur: "Rajasthan",
  Jodhpur: "Rajasthan",
  Udaipur: "Rajasthan",
  Kota: "Rajasthan",
  // Tamil Nadu
  Chennai: "Tamil Nadu",
  Vellore: "Tamil Nadu",
  Coimbatore: "Tamil Nadu",
  Madurai: "Tamil Nadu",
  // Telangana
  Hyderabad: "Telangana",
  Warangal: "Telangana",
  // Uttarakhand
  Dehradun: "Uttarakhand",
  Haridwar: "Uttarakhand",
  // Uttar Pradesh
  Lucknow: "Uttar Pradesh",
  Ghaziabad: "Uttar Pradesh",
  Noida: "Uttar Pradesh",
  Kanpur: "Uttar Pradesh",
  Aligarh: "Uttar Pradesh",
  Bareilly: "Uttar Pradesh",
  Mathura: "Uttar Pradesh",
  Agra: "Uttar Pradesh",
  Varanasi: "Uttar Pradesh",
  Meerut: "Uttar Pradesh",
  Prayagraj: "Uttar Pradesh",
  // West Bengal
  Kolkata: "West Bengal",
  Howrah: "West Bengal",
  Siliguri: "West Bengal",
};

/**
 * States people typed into the city box.
 *
 * Several did. "Kerala" is not a city, and pretending it is would put a lone
 * entry in the city dropdown that matches nothing; recording the state and
 * leaving the city blank is the honest reading of what they told us.
 */
const STATE_ALIASES: Record<string, string> = {
  kerala: "Kerala",
  kerela: "Kerala",
  gujarat: "Gujarat",
  "andhra pradesh": "Andhra Pradesh",
  andrapradesh: "Andhra Pradesh",
  "arunachal pradesh": "Arunachal Pradesh",
  karnataka: "Karnataka",
  maharashtra: "Maharashtra",
  punjab: "Punjab",
  rajasthan: "Rajasthan",
  telangana: "Telangana",
  "tamil nadu": "Tamil Nadu",
  "uttar pradesh": "Uttar Pradesh",
  "west bengal": "West Bengal",
  haryana: "Haryana",
};

/** Every state we can resolve to, sorted — the filter's own options. */
export const KNOWN_STATES = Array.from(
  new Set([...Object.values(CITY_STATE), ...Object.values(STATE_ALIASES)])
).sort();

const titleCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

/**
 * Reads a free-text city into a canonical city and state.
 *
 * An unrecognised city is kept and title-cased rather than discarded — it is
 * still a real place we just don't have a state for, and it should appear in
 * the filter so nobody goes missing from the list.
 */
export const canonicalLocation = (rawInput: unknown): CanonicalLocation => {
  const raw = String(rawInput ?? "").trim();
  if (!raw) return { city: null, state: null, raw: "" };

  // "Nagpur,pune" and "Banglore,kochi,trivandrum" — take the first, which is
  // where they actually live; the rest is where they'll travel.
  const first = raw.split(/[,/]|\band\b/i)[0]?.trim() || raw;
  const k = key(first);
  if (!k) return { city: null, state: null, raw };

  if (STATE_ALIASES[k]) return { city: null, state: STATE_ALIASES[k], raw };

  const city = CITY_ALIASES[k] || titleCase(k);
  return { city, state: CITY_STATE[city] ?? null, raw };
};

/** Groups a set of records into the state/city tree the filter renders from. */
export const buildLocationIndex = (rows: { city: string | null; state: string | null }[]) => {
  const states = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const state = row.state || "Unknown";
    const city = row.city || "Not specified";
    if (!states.has(state)) states.set(state, new Map());
    const cities = states.get(state)!;
    cities.set(city, (cities.get(city) || 0) + 1);
  }

  return Array.from(states.entries())
    // "Unknown" last; everything else alphabetical.
    .sort(([a], [b]) => (a === "Unknown" ? 1 : b === "Unknown" ? -1 : a.localeCompare(b)))
    .map(([state, cities]) => ({
      state,
      count: Array.from(cities.values()).reduce((sum, n) => sum + n, 0),
      cities: Array.from(cities.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([city, count]) => ({ city, count })),
    }));
};
