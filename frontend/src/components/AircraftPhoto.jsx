import { useState, useEffect } from 'react'

export default function AircraftPhoto({ icao24 }) {
  const [photo, setPhoto]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!icao24) return
    setPhoto(null)
    setLoading(true)

    fetch(`https://api.planespotters.net/pub/photos/hex/${icao24}`)
      .then(r => r.json())
      .then(data => {
        if (data.photos?.length > 0) setPhoto(data.photos[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [icao24])

  if (loading) return <div className="photo-loading">Loading photo…</div>
  if (!photo)  return null

  return (
    <a
      className="aircraft-photo"
      href={photo.link}
      target="_blank"
      rel="noopener noreferrer"
      title={`Photo by ${photo.photographer}`}
    >
      <img src={photo.thumbnail?.src} alt="Aircraft" loading="lazy" />
      <div className="photo-credit">📷 {photo.photographer}</div>
    </a>
  )
}
