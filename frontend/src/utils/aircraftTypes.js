// Module-level cache: icao24 (lowercase) → category string.
// Written by FlightDetail when acInfo loads; read by FlightLayer on every sync().
const _cache = new Map()

// Map ICAO type code to display category.
export function categorize(typeCode) {
  if (!typeCode) return 'default'
  const t = typeCode.toUpperCase()

  // 4-engine heavies (A380, 747 family)
  if (/^(A38[08]|B74[12458DS]|AN124|C5M|IL76)/.test(t))           return 'heavy4'

  // Wide-body twins (777, 787, A330, A340, A350, 767)
  if (/^(B77[23LWFE]|B78[789X]|A33[23489]|A34[23456]|A35[09K]|B76[234]|MD1[01]|DC10|IL96)/.test(t)) return 'widebody'

  // Narrow-body jets (737, 757, A320 family, MD-80/90, DC-9, 717)
  if (/^(B73[5-9]|B757|B75[67]|A31[89]|A32[0-3]|A22[01]|MD[89][0-5]|DC9|B717)/.test(t)) return 'narrowbody'

  // Regional jets and turboprops (CRJ, E-jets, ATR, Dash 8, etc.)
  if (/^(CRJ|E1[45][05]|E17[05]|E27[05]|E4[45]|E75|SF3|BEH|DH8|AT[47]|F50|CL60|GLF|LJ[34567]|FA7|PC12|C208|BE20|B190)/.test(t)) return 'regional'

  return 'default'  // military, unknown, GA etc. fall back to ✈ emoji
}

export const getCachedType = icao24 => _cache.get(icao24?.toLowerCase()) ?? 'default'

export const setCachedType = (icao24, typeCode) => {
  if (icao24 && typeCode) _cache.set(icao24.toLowerCase(), categorize(typeCode))
}
