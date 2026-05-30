declare module "leaflet" {
  export type LatLngExpression = [number, number] | { lat: number; lng: number };
  export type LatLngBoundsExpression = LatLngExpression[];

  export interface FitBoundsOptions {
    animate?: boolean;
    padding?: [number, number];
    maxZoom?: number;
  }

  export interface ZoomPanOptions {
    animate?: boolean;
  }

  export interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
    maxZoom?: number;
    maxBounds?: LatLngBoundsExpression;
    zoomControl?: boolean;
    dragging?: boolean;
    doubleClickZoom?: boolean;
    scrollWheelZoom?: boolean;
  }

  export interface PathOptions {
    color?: string;
    weight?: number;
    fillColor?: string;
    fillOpacity?: number;
    dashArray?: string;
  }

  export interface InteractiveLayerOptions {
    interactive?: boolean;
  }

  export interface LayerOptions extends InteractiveLayerOptions {
    attribution?: string;
    pane?: string;
  }

  export interface GridLayerOptions extends LayerOptions {
    maxZoom?: number;
    maxNativeZoom?: number;
  }

  export interface TileLayerOptions extends GridLayerOptions {
    url?: string;
  }

  export interface PolylineOptions extends PathOptions {}
  export interface PolygonOptions extends PolylineOptions {}

  export interface CircleMarkerOptions extends PathOptions {
    radius?: number;
  }

  export interface CircleOptions extends CircleMarkerOptions {}

  export class Map {
    setView(center: LatLngExpression, zoom?: number, options?: ZoomPanOptions): this;
    fitBounds(bounds: LatLngBounds, options?: FitBoundsOptions): this;
    invalidateSize(): this;
    getCenter(): { lat: number; lng: number };
    getZoom(): number;
    zoomIn(delta?: number): this;
    zoomOut(delta?: number): this;
  }

  export class LatLngBounds {
    constructor(latlngs: Array<[number, number]>);
  }

  export class GridLayer {}
  export class TileLayer extends GridLayer {}
  export class FeatureGroup {}
  export class Path {}
  export class Polyline<P = unknown> extends Path {}
  export class Polygon<P = unknown> extends Polyline<P> {}
  export class CircleMarker<P = unknown> extends Path {}
  export class Circle<P = unknown> extends CircleMarker<P> {}

  export interface LeafletMouseEvent {
    latlng: {
      lat: number;
      lng: number;
    };
  }
}
