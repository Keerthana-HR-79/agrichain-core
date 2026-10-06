import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip
} from "react-leaflet";

import L from "leaflet";
import "./components.css";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",

  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",

  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const farmIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",

  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [35, 55],
  iconAnchor: [17, 55],
});

const photoIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [35, 55],
  iconAnchor: [17, 55],
});

export default function StageMap({
  farmLat,
  farmLng,
  imageLat,
  imageLng
}) {

  if (
    !farmLat ||
    !farmLng ||
    !imageLat ||
    !imageLng
  ) {
    return null;
  }

  const sameLocation =
    Math.abs(
      Number(farmLat) -
      Number(imageLat)
    ) < 0.0001 &&
    Math.abs(
      Number(farmLng) -
      Number(imageLng)
    ) < 0.0001;

  return (

    <div>

      <div
        style={{
          height: "350px",
          width: "100%",
          overflow: "hidden",
          borderRadius: "12px"
        }}
      >

        <MapContainer
          center={[
            Number(farmLat),
            Number(farmLng)
          ]}
          zoom={15}
          style={{
            height: "100%",
            width: "100%"
          }}
        >

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {sameLocation ? (

            <Marker
              position={[
                Number(farmLat),
                Number(farmLng)
              ]}
              icon={farmIcon}
            >

              <Tooltip
                permanent
                direction="top"
              >
                🎯 Exact Farm Match
              </Tooltip>

              <Popup>
                🚜 Farm Location
                <br />
                📸 Photo Location
                <br />
                Distance: 0 meters
              </Popup>

            </Marker>

          ) : (

            <>

              <Marker
                position={[
                  Number(farmLat),
                  Number(farmLng)
                ]}
                icon={farmIcon}
              >

                <Tooltip
                  permanent
                  direction="top"
                >
                  🚜 Farm
                </Tooltip>

                <Popup>
                  Registered Farm Location
                </Popup>

              </Marker>

              <Marker
                position={[
                  Number(imageLat),
                  Number(imageLng)
                ]}
                icon={photoIcon}
              >

                <Tooltip
                  permanent
                  direction="top"
                >
                  📸 Photo
                </Tooltip>

                <Popup>
                  Uploaded Crop Photo Location
                </Popup>

              </Marker>

              <Polyline
                positions={[
                  [
                    Number(farmLat),
                    Number(farmLng)
                  ],
                  [
                    Number(imageLat),
                    Number(imageLng)
                  ]
                ]}
              />

            </>

          )}

        </MapContainer>

      </div>

      <div className="smap-legend">

        <div className="smap-legend__farm">
          🟢 Registered Farm
        </div>

        <div className="smap-legend__photo">
          🔴 Uploaded Photo
        </div>

      </div>

    </div>

  );

}
