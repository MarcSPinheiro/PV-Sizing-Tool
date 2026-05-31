import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { LatLngBounds, type LeafletMouseEvent, type LatLngExpression } from "leaflet";
import { Layers, LocateFixed, Minus, Plus } from "lucide-react";

export type MapPoint = { lat: number; lng: number };

export type MapArea = {
  id: string;
  nome: string;
  cor: string;
  tipo: "triangulos" | "coplanar";
  panelOrientation?: "horizontal" | "vertical";
  paineis: number;
  strings: { nome: string; paineis: number }[];
  rotacao: number;
  panelOffsetLat?: number;
  panelOffsetLng?: number;
  points: MapPoint[];
};

export type PanelOverlay = {
  id: string;
  areaId: string;
  stringIndex: number;
  corners: MapPoint[];
  center: MapPoint;
};

export type MapPanelSpec = {
  nome: string;
  potenciaWp: number;
  larguraM: number;
  alturaM: number;
};

const STRING_COLORS = ["#22c55e", "#a855f7", "#06b6d4", "#f97316", "#e11d48"];
const PANEL_FILL = "#19375f";
const METERS_PER_DEGREE_LAT = 111_320;
const MAP_MAX_ZOOM = 24;
const PORTUGAL_CENTER: LatLngExpression = [39.6, -8.0];
const PORTUGAL_BOUNDS: LatLngExpression[] = [
  [32.0, -31.5],
  [42.3, -6.0],
];

export type MapViewState = {
  center: MapPoint;
  zoom: number;
};

const validPoint = (point: MapPoint) =>
  typeof point?.lat === "number" &&
  typeof point?.lng === "number" &&
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng);

export function polygonAreaM2(points: MapPoint[]) {
  if (points.length < 3) return 0;

  const lat0 = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos((lat0 * Math.PI) / 180);
  const projected = points.map((point) => ({
    x: point.lng * metersPerDegreeLng,
    y: point.lat * METERS_PER_DEGREE_LAT,
  }));

  const area = projected.reduce((sum, point, index) => {
    const next = projected[(index + 1) % projected.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(area) / 2;
}

function pointInPolygon(point: MapPoint, polygon: MapPoint[]) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function rotatePoint(point: MapPoint, center: MapPoint, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180);
  const dx = (point.lng - center.lng) * metersPerDegreeLng;
  const dy = (point.lat - center.lat) * METERS_PER_DEGREE_LAT;
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;

  return {
    lat: center.lat + rotatedY / METERS_PER_DEGREE_LAT,
    lng: center.lng + rotatedX / metersPerDegreeLng,
  };
}

function getStringIndex(area: MapArea, panelIndex: number) {
  let acc = 0;

  for (let i = 0; i < area.strings.length; i++) {
    acc += area.strings[i].paineis;
    if (panelIndex < acc) return i;
  }

  return Math.max(0, area.strings.length - 1);
}

export function createPanelLayout(
  area: MapArea,
  panelSpec: MapPanelSpec,
): PanelOverlay[] {
  if (area.points.length < 3 || area.paineis <= 0) return [];

  const lats = area.points.map((point) => point.lat);
  const lngs = area.points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;

  if (latSpan <= 0 || lngSpan <= 0) return [];

  const polygonCenter = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const center = {
    lat: polygonCenter.lat + (area.panelOffsetLat ??0),
    lng: polygonCenter.lng + (area.panelOffsetLng ??0),
  };
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.cos((polygonCenter.lat * Math.PI) / 180);
  const isVertical = area.panelOrientation === "vertical";
  const panelLng = (isVertical ?panelSpec.larguraM : panelSpec.alturaM) / metersPerDegreeLng;
  const panelLat = (isVertical ?panelSpec.alturaM : panelSpec.larguraM) / METERS_PER_DEGREE_LAT;
  const cellLng = panelLng * 1.12;
  const cellLat =
    area.tipo === "coplanar"
      ?panelLat * 1.08
      : Math.max(panelLat * 1.35, 4.32 / METERS_PER_DEGREE_LAT);
  const usableLng = lngSpan * 0.86;
  const usableLat = lngSpan > 0 ?latSpan * 0.86 : 0;
  const cols = Math.max(1, Math.floor(usableLng / cellLng));
  const rows = Math.max(1, Math.ceil(area.paineis / cols));
  const layoutLat = Math.min(usableLat, rows * cellLat);
  const startLng = center.lng - usableLng / 2 + cellLng / 2;
  const startLat = center.lat + layoutLat / 2 - cellLat / 2;
  const panels: PanelOverlay[] = [];

  for (let row = 0; row < rows * 2 && panels.length < area.paineis; row++) {
    for (let col = 0; col < cols && panels.length < area.paineis; col++) {
      const panelCenter = {
        lat: startLat - row * cellLat,
        lng: startLng + col * cellLng,
      };
      const corners = [
        { lat: panelCenter.lat - panelLat / 2, lng: panelCenter.lng - panelLng / 2 },
        { lat: panelCenter.lat - panelLat / 2, lng: panelCenter.lng + panelLng / 2 },
        { lat: panelCenter.lat + panelLat / 2, lng: panelCenter.lng + panelLng / 2 },
        { lat: panelCenter.lat + panelLat / 2, lng: panelCenter.lng - panelLng / 2 },
      ].map((point) => rotatePoint(point, center, area.rotacao));
      const rotatedCenter = rotatePoint(panelCenter, center, area.rotacao);

      if (
        pointInPolygon(rotatedCenter, area.points) &&
        corners.every((point) => pointInPolygon(point, area.points))
      ) {
        panels.push({
          id: `${area.id}-panel-${panels.length}`,
          areaId: area.id,
          stringIndex: getStringIndex(area, panels.length),
          corners,
          center: rotatedCenter,
        });
      }
    }
  }

  return panels;
}

function SearchBox() {
  const map = useMap();
  const [query, setQuery] = useState("");

  const search = async (value = query) => {
    if (!value.trim()) return;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pt&q=${encodeURIComponent(value)}`,
    );
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;

    if (data?.[0]) {
      map.setView([Number(data[0].lat), Number(data[0].lon)], 21);
    }
  };

  return (
    <div className="absolute left-5 top-5 z-[1000] flex w-[min(360px,calc(100%-40px))] overflow-hidden rounded-md bg-white shadow-lg">
      <input
        className="h-11 min-w-0 flex-1 px-4 text-sm outline-none"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") search();
        }}
        placeholder="Pesquisar localizacao"
      />
      <button
        type="button"
        className="grid h-11 w-12 place-items-center border-l text-slate-700"
        onClick={() => search()}
      >
        <LocateFixed className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddressAutoCenter({ address }: { address?: string }) {
  const map = useMap();

  useEffect(() => {
    const trimmed = address?.trim();
    if (!trimmed) {
      map.setView(PORTUGAL_CENTER, 7);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const query = /portugal/i.test(trimmed) ?trimmed : `${trimmed}, Portugal`;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pt&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as Array<{ lat: string; lon: string }>;

        if (data?.[0]) {
          map.setView([Number(data[0].lat), Number(data[0].lon)], 20);
        } else {
          map.setView(PORTUGAL_CENTER, 7);
        }
      } catch {
        if (!controller.signal.aborted) map.setView(PORTUGAL_CENTER, 7);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [address, map]);

  return null;
}

function AreaAutoCenter({ areas }: { areas: MapArea[] }) {
  const map = useMap();

  useEffect(() => {
    const points = areas
      .flatMap((area) => area.points)
      .filter(validPoint);

    if (!points.length) return;

    const bounds = new LatLngBounds(
      points.map((point) => [point.lat, point.lng] as [number, number]),
    );

    const timeout = window.setTimeout(() => {
      map.fitBounds(bounds, {
        animate: false,
        maxZoom: 22,
        padding: [80, 80],
      });
      map.invalidateSize();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [areas, map]);

  return null;
}

function MapViewMemory({
  view,
  onViewChange,
}: {
  view?: MapViewState | null;
  onViewChange?: (view: MapViewState) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!view) return;

    const timeout = window.setTimeout(() => {
      map.setView([view.center.lat, view.center.lng], view.zoom, {
        animate: false,
      });
      map.invalidateSize();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [map, view]);

  useMapEvents({
    moveend() {
      const center = map.getCenter();
      onViewChange?.({
        center: { lat: center.lat, lng: center.lng },
        zoom: map.getZoom(),
      });
    },
    zoomend() {
      const center = map.getCenter();
      onViewChange?.({
        center: { lat: center.lat, lng: center.lng },
        zoom: map.getZoom(),
      });
    },
  });

  return null;
}

function DrawEvents({
  drawing,
  onAddPoint,
}: {
  drawing: boolean;
  onAddPoint: (point: MapPoint) => void;
}) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      if (!drawing) return;
      onAddPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function MapTools() {
  const map = useMap();

  return (
    <>
      <div className="absolute left-5 top-24 z-[1000] overflow-hidden rounded-md bg-white shadow-lg">
        <button
          type="button"
          className="grid h-11 w-11 place-items-center border-b"
          onClick={() => map.zoomIn()}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center"
          onClick={() => map.zoomOut()}
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
      <div className="absolute right-5 top-5 z-[1000] flex overflow-hidden rounded-md bg-white shadow-lg">
        <button type="button" className="bg-blue-50 px-6 py-3 text-sm font-semibold text-blue-700">
          Satelite
        </button>
        <button type="button" className="px-6 py-3 text-sm font-semibold text-slate-700">
          Mapa
        </button>
        <button type="button" className="grid w-12 place-items-center border-l">
          <Layers className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

export function SatelliteMap({
  areas,
  selectedId,
  drawing,
  draftPoints,
  address,
  panelSpec,
  showStringLines = true,
  savedView,
  onAddPoint,
  onSelectArea,
  onViewChange,
}: {
  areas: MapArea[];
  selectedId: string | null;
  drawing: boolean;
  draftPoints: MapPoint[];
  address?: string;
  panelSpec: MapPanelSpec;
  showStringLines?: boolean;
  savedView?: MapViewState | null;
  onAddPoint: (point: MapPoint) => void;
  onSelectArea: (id: string) => void;
  onViewChange?: (view: MapViewState) => void;
}) {
  useEffect(() => {
    document.body.classList.toggle("map-drawing-active", drawing);

    return () => {
      document.body.classList.remove("map-drawing-active");
    };
  }, [drawing]);

  const validAreas = areas.filter(
    (area) => area.points?.length >= 3 && area.points.every(validPoint),
  );
  const validDraftPoints = draftPoints.filter(validPoint);
  const panels = useMemo(
    () => validAreas.flatMap((area) => createPanelLayout(area, panelSpec)),
    [validAreas, panelSpec],
  );
  const mapCursor = drawing ?"default" : "grab";
  const mapClassName = drawing ?"map-drawing-mode" : undefined;

  return (
    <MapContainer
      className={mapClassName}
      center={PORTUGAL_CENTER}
      zoom={7}
      maxZoom={MAP_MAX_ZOOM}
      maxBounds={PORTUGAL_BOUNDS}
      zoomControl={false}
      dragging={!drawing}
      doubleClickZoom={!drawing}
      scrollWheelZoom={!drawing}
      style={{ width: "100%", height: "100%", cursor: mapCursor }}
    >
      <TileLayer
        attribution="Esri Satellite"
        maxNativeZoom={19}
        maxZoom={MAP_MAX_ZOOM}
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />

      <SearchBox />
      <MapViewMemory view={savedView} onViewChange={onViewChange} />
      {savedView ?null : validAreas.length > 0 ?(
        <AreaAutoCenter areas={validAreas} />
      ) : (
        <AddressAutoCenter address={address} />
      )}
      <MapTools />
      <DrawEvents drawing={drawing} onAddPoint={onAddPoint} />

      {validAreas.map((area) => (
        <Polygon
          key={area.id}
          positions={area.points.map((p) => [p.lat, p.lng]) as LatLngExpression[]}
          pathOptions={{
            color: area.cor,
            weight: selectedId === area.id ?4 : 2,
            fillColor: area.cor,
            fillOpacity: selectedId === area.id ?0.22 : 0.16,
          }}
          eventHandlers={{
            click: () => onSelectArea(area.id),
          }}
        />
      ))}

      {panels.map((panel) => (
        <Polygon
          key={panel.id}
          positions={panel.corners.map((p) => [p.lat, p.lng]) as LatLngExpression[]}
          pathOptions={{
            color: STRING_COLORS[panel.stringIndex % STRING_COLORS.length],
            weight: 0.8,
            fillColor: PANEL_FILL,
            fillOpacity: 0.9,
          }}
          eventHandlers={{
            click: () => onSelectArea(panel.areaId),
          }}
        />
      ))}

      {showStringLines &&
        validAreas.flatMap((area) =>
          area.strings.map((_, stringIndex) => {
            const stringPanels = panels.filter(
              (panel) =>
                panel.areaId === area.id && panel.stringIndex === stringIndex,
            );

            if (stringPanels.length < 2) return null;

            return (
              <Polyline
                key={`${area.id}-string-${stringIndex}`}
                positions={
                  stringPanels.map((panel) => [
                    panel.center.lat,
                    panel.center.lng,
                  ]) as LatLngExpression[]
                }
                pathOptions={{
                  color: STRING_COLORS[stringIndex % STRING_COLORS.length],
                  weight: 2,
                }}
              />
            );
          }),
        )}

      {validAreas.flatMap((area) =>
        area.points.map((point, index) => (
          <CircleMarker
            key={`${area.id}-vertex-${index}`}
            center={[point.lat, point.lng]}
            radius={5}
            pathOptions={{
              color: "white",
              weight: 2,
              fillColor: area.cor,
              fillOpacity: 1,
            }}
          />
        )),
      )}

      {validDraftPoints.length > 1 && (
        <Polyline
          positions={
            validDraftPoints.map((p) => [p.lat, p.lng]) as LatLngExpression[]
          }
          pathOptions={{ color: "#2563eb", weight: 3, dashArray: "8 6" }}
        />
      )}

      {validDraftPoints.map((point, index) => (
        <CircleMarker
          key={`${point.lat}-${point.lng}-${index}`}
          center={[point.lat, point.lng]}
          radius={6}
          pathOptions={{
            color: "white",
            weight: 2,
            fillColor: "#2563eb",
            fillOpacity: 1,
          }}
        />
      ))}
    </MapContainer>
  );
}
