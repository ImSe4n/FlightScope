// Module-level cache: icao24 (lowercase) → category string.
// Written by FlightDetail when acInfo loads; read by FlightLayer on every sync().
const _cache = new Map()

// Map ICAO type code to one of 16 specific display categories.
export function categorize(typeCode) {
  if (!typeCode) return 'default'
  const t = typeCode.toUpperCase()

  // ── 4-engine heavies ──────────────────────────────────────────────────────
  if (/^A38[08]/.test(t)) return 'a380'
  if (/^B74[12458DS]|^B74F/.test(t)) return 'b747'
  if (/^(IL76|AN12[4]?|C5M)/.test(t)) return 'b747'

  // ── Wide-body twins ───────────────────────────────────────────────────────
  if (/^B77[23LWFE89X]/.test(t)) return 'b777'
  if (/^B78[789X]/.test(t)) return 'b787'
  if (/^A35[09KF]/.test(t)) return 'a350'
  if (/^A33[023489]|^A34[23456]/.test(t)) return 'a330'  // A330 + A340
  if (/^B76[234]|^(MD1[01]|DC10|IL96)/.test(t)) return 'b767'

  // ── Narrow-body ───────────────────────────────────────────────────────────
  if (/^A321|^A21N/.test(t)) return 'a321'               // before A320 match
  if (/^B75[2367]/.test(t)) return 'b757'
  if (/^B73[5-9]|^B3[789]M|^B3XM/.test(t)) return 'b737'
  if (/^A320|^A32N/.test(t)) return 'a320'
  if (/^A31[89]|^A19N|^A22[013]|^BCS[13]|^(MD[89][0-5]|DC9|B717)/.test(t)) return 'a319'

  // ── Business jets ─────────────────────────────────────────────────────────
  if (/^(GLF[456]|LJ[34567]|FA[278X]|FA2T|CL60|CL65|GLEX|GALX|H25[ABC]|E50P|C5[26][05X]|C68A|C750|PC24|GL5T|GL7T)/.test(t)) return 'bizjet'

  // ── Turboprops ────────────────────────────────────────────────────────────
  if (/^AT[47][23567]/.test(t)) return 'atr'
  if (/^DH8[ABCD]?|^DHC[46]|^PC12|^BE20|^BEH|^B190|^SF3|^F50|^Q4/.test(t)) return 'q400'

  // ── Regional jets ─────────────────────────────────────────────────────────
  if (/^CRJ[1279X]?|^E1[47][05]|^E19[05]|^E27[05]|^E75[SL]?|^ERJ/.test(t)) return 'crj'

  return 'default'  // military, unknown, GA piston → ✈ emoji
}

export const getCachedType = icao24 => _cache.get(icao24?.toLowerCase()) ?? 'default'

export const setCachedType = (icao24, typeCode) => {
  if (icao24 && typeCode) _cache.set(icao24.toLowerCase(), categorize(typeCode))
}
