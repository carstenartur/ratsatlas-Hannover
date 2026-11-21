/* Gebietsnavigation und Kartenbeschriftung aus Ratsatlas Bonn, site/app.js
 * daimpad/ratsatlas-bonn@f8850008e81825ae79be49ca7f3441b928a1858b (MIT).
 * Hannover adapts area keys, place counts and navigation to official SKH5 data. */

const RAMP = [[262, 92, 0.3], [262, 82, 0.4], [264, 70, 0.5], [266, 58, 0.58], [268, 46, 0.66]];
const NAV_LINE = { color: '#6d28d9', weight: 1, opacity: 0.55, fillOpacity: 1 };
const BZ_LINE = { color: '#6d28d9', weight: 2, opacity: 0.7, fillOpacity: 1 };
const GLASS = { color: '#fff', weight: 2.5, opacity: 1, fillColor: 'url(#nav-glass)', fillOpacity: 1 };
const OUTLINE = { color: '#7c3aed', weight: 2, fillColor: '#c4b5fd', fillOpacity: 0.12 };
const DETAIL_ZOOM = 14;
const QUANTILES = [0.2, 0.4, 0.6, 0.8];
const number = new Intl.NumberFormat('de-DE');
const nameOrder = (a, b) => a.properties.name.localeCompare(b.properties.name, 'de');
const ns = 'http://www.w3.org/2000/svg';

export function areaCounts(areas, matchedIds) {
  return new Map(areas.map(({properties: {areaId, recordIds}}) => [
    areaId, matchedIds ? new Set(recordIds.filter(id => matchedIds.has(id))).size : null,
  ]));
}

export function areaMode(area, zoom, focusRecord = false) {
  if (focusRecord || area?.properties.kind === 'stadtteil') return 'places';
  if (area?.properties.kind === 'bezirk') return 'neighborhoods';
  return zoom >= DETAIL_ZOOM ? 'places' : 'districts';
}

export function combineCoincidentFeatures(features) {
  const groups = new Map();
  for (const feature of features) {
    const key = JSON.stringify(feature.geometry);
    if (!groups.has(key)) groups.set(key,{feature,recordIds:new Set()});
    const group = groups.get(key);
    for (const id of feature.properties.recordIds) group.recordIds.add(id);
  }
  // Canvas delivers a click only to the topmost path. A single displayed path
  // must therefore expose the records of every coincident source feature.
  return [...groups.values()].map(({feature,recordIds}) => ({...feature,properties:{...feature.properties,recordIds:[...recordIds]}}));
}

function alongLine(line, distance, lengths) {
  for (let index = 0; index < lengths.length; index++) {
    const segment = lengths[index];
    if (segment && distance <= segment) {
      const from = line[index], to = line[index + 1], fraction = distance / segment;
      return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
    }
    distance -= segment;
  }
  return line[0] || null;
}

export function overviewPoint({type, coordinates}) {
  if (type === 'Point') return coordinates;
  if (type === 'MultiPoint') return coordinates[0] || null;
  const lines = {
    LineString: () => [coordinates],
    MultiLineString: () => coordinates,
    Polygon: () => [coordinates[0]],
    MultiPolygon: () => coordinates.map(polygon => polygon[0]),
  }[type]?.() || [];

  // Use a point on the longest line or exterior ring. A bounding box midpoint
  // can be off the source street or outside the source polygon.
  let longest = [], distances = [], length = -1;
  for (const line of lines) {
    const segments = line.slice(1).map((point, i) => Math.hypot(point[0] - line[i][0], point[1] - line[i][1]));
    const total = segments.reduce((sum, segment) => sum + segment, 0);
    if (total > length) {
      longest = line;
      distances = segments;
      length = total;
    }
  }
  return alongLine(longest, length / 2, distances);
}

export function mapDisplayFeatures(features, detail) {
  const districts = [], neighborhoods = [], places = [];
  for (const feature of features) {
    if (feature.properties.kind === 'area') {
      if (feature.properties.areaId?.startsWith('stadtteil:')) neighborhoods.push(feature);
      else districts.push(feature);
    } else if (detail) {
      places.push(feature);
    } else {
      const coordinates = overviewPoint(feature.geometry);
      if (coordinates) places.push({...feature, geometry:{type:'Point',coordinates}});
    }
  }
  // Canvas sends the click to the topmost hit, so draw the most specific locations last.
  return [...districts, ...neighborhoods, ...places];
}

// The current filter determines the colour ramp for each level, using the
// district scale and the neighborhood quintiles from Bonn.
function breaksFor(areas, counts, far) {
  const values = areas.map(area => counts.get(area.properties.areaId) || 0).sort((a, b) => a - b);
  if (!values.at(-1)) return [];
  return [...new Set(QUANTILES.map(q => far
    ? Math.round(q * values.at(-1)) + 1
    : values[Math.floor(q * (values.length - 1))] + 1))];
}

function navDefs(renderer, doc) {
  const svg = renderer._container;
  if (!svg || svg.querySelector('#nav-glass')) return;
  const stops = list => list.map(([offset, color, opacity]) =>
    `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join('');
  const gradients = RAMP.map(([h, l, a], index) =>
    `<linearGradient id="nav-c${index}" x1="0" y1="0" x2="1" y2="1">${stops([
      [0, `hsl(${h},80%,${l + 6}%)`, a], [1, `hsl(${h + 6},65%,${l - 8}%)`, a * 0.8],
    ])}</linearGradient>`).join('');
  const defs = doc.createElementNS(ns, 'defs');
  defs.innerHTML = `${gradients}<linearGradient id="nav-glass" x1="0" y1="0" x2="0.6" y2="1">${stops([
    [0, '#fff', 0.62], [0.45, '#fff', 0.3], [1, '#ede9fe', 0.22],
  ])}</linearGradient>
    <filter id="nav-glow" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/>
      <feFlood flood-color="#fff" flood-opacity="0.9"/><feComposite in2="b" operator="in" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.insertBefore(defs, svg.firstChild);
}

function updateLegend(legend, breaks, far, loaded) {
  legend.querySelector('summary').textContent = far ? 'Vorgänge je Stadtbezirk' : 'Vorgänge je Stadtteil';
  const list = legend.querySelector('ol');
  if (!loaded || !breaks.length) {
    const text = loaded ? '0' : 'Vorgänge werden geladen …';
    list.innerHTML = `<li><span class="nav-sw nav-sw0" aria-hidden="true"></span>${text}</li>`;
    return;
  }
  list.innerHTML = [0, ...breaks].map((from, index) => {
    const until = breaks[index];
    const range = until === undefined ? `ab ${number.format(from)}`
      : until === from + 1 ? number.format(from) : `${number.format(from)}–${number.format(until - 1)}`;
    return `<li><span class="nav-sw nav-sw${index}" aria-hidden="true"></span>${range}</li>`;
  }).join('');
}

export function createMapGeography({L, map, select, onSelect, getPadding = () => ({})}) {
  const doc = select.ownerDocument;
  // Leaflet retains the base Canvas renderer after its last path is removed.
  // Keep interactive areas above that transparent canvas and below selection.
  map.createPane('gebiete').style.zIndex = 405;
  const renderer = L.svg({pane: 'gebiete', padding: 0.3});
  renderer.on('add', () => navDefs(renderer, doc));

  const areas = new Map(), boundsById = new Map();
  let districts = [], neighborhoods = [], cityBounds = null, mode = 'districts', active = '';
  let matches = null, layer, labelGroup, attribution;
  const selectArea = areaId => onSelect(areaId, {bounds: getBounds(areaId)});
  const legend = doc.createElement('details');
  legend.className = 'nav-legend';
  legend.hidden = true;
  legend.innerHTML = '<summary></summary><ol class="nav-ramp"></ol><p>Verortete Vorgänge · aktueller Filter. Ein Vorgang kann mehrere Gebiete berühren.</p>';
  const legendControl = L.control({position: 'bottomleft'});
  legendControl.onAdd = () => {
    L.DomEvent.disableClickPropagation(legend);
    L.DomEvent.disableScrollPropagation(legend);
    return legend;
  };
  legendControl.addTo(map);

  const cityControl = L.control({position: 'bottomright'});
  const cityButton = doc.createElement('button');
  cityButton.className = 'map-style map-whole';
  cityButton.type = 'button';
  cityButton.title = 'Ganz Hannover ansehen';
  cityButton.hidden = true;
  cityButton.innerHTML = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span class="map-whole-text">Ganz Hannover ansehen</span>';
  cityButton.addEventListener('click', () => selectArea(''));
  cityControl.onAdd = () => {
    L.DomEvent.disableClickPropagation(cityButton);
    return cityButton;
  };
  cityControl.addTo(map);

  select.addEventListener('change', () => selectArea(select.value));
  function getArea(areaId) { return areas.get(areaId) || null; }

  function getBounds(areaId = '') {
    const area = getArea(areaId);
    if (!area) return cityBounds;
    if (!boundsById.has(areaId)) boundsById.set(areaId, L.geoJSON(area).getBounds());
    return boundsById.get(areaId);
  }

  function fillAreaSelect() {
    const option = (value, name) => {
      const element = doc.createElement('option');
      element.value = value;
      element.textContent = name;
      return element;
    };
    select.replaceChildren(option('', 'Ganz Hannover'));
    for (const district of districts) {
      const {areaId, name} = district.properties;
      const group = doc.createElement('optgroup');
      group.label = name;
      group.append(option(areaId, `Stadtbezirk ${name}`));
      for (const {properties} of neighborhoods.filter(area => area.properties.parentId === areaId)) {
        group.append(option(properties.areaId, properties.name));
      }
      select.append(group);
    }
    select.disabled = false;
  }

  function setData(geography) {
    areas.clear();
    boundsById.clear();
    for (const area of geography.features) areas.set(area.properties.areaId, area);
    districts = geography.features.filter(area => area.properties.kind === 'bezirk').sort(nameOrder);
    neighborhoods = geography.features.filter(area => area.properties.kind === 'stadtteil').sort(nameOrder);
    cityBounds = L.geoJSON(districts).getBounds();
    cityButton.hidden = false;
    const source = geography.sources?.[0];
    if (source && !attribution) {
      const link = doc.createElement('a');
      link.href = source.url;
      link.title = source.attribution;
      link.textContent = 'Gebietsgrenzen: LH Hannover';
      attribution = link.outerHTML;
      map.attributionControl?.addAttribution(attribution);
    }
    fillAreaSelect();
    update({}, true);
  }

  function label(area, count, far) {
    const properties = area.properties;
    const label = doc.createElement('span');
    label.textContent = properties.name;
    const amount = doc.createElement('span');
    amount.className = 'nav-n';
    amount.textContent = count === null ? '–' : number.format(count);
    label.append(amount);
    const [lng, lat] = properties.labelPoint;
    return L.tooltip({permanent: true, direction: 'center', className: `nav-label ${far ? 'nav-label-bz' : 'nav-label-ot'}`,
      interactive: false}).setLatLng([lat, lng]).setContent(label);
  }

  // Hannover has thirteen district labels. Keep small screens readable while
  // preserving all polygon hit areas and district names in the selector.
  function positionLabels() {
    if (!labelGroup) return;
    const occupied = [];
    const mapBox = map.getContainer().getBoundingClientRect();
    const {paddingTopLeft = [0, 0], paddingBottomRight = [0, 0]} = getPadding();
    labelGroup.eachLayer(tooltip => {
      const element = tooltip.getElement();
      if (!element) return;
      const box = element.getBoundingClientRect();
      const inFrame = box.left >= mapBox.left + paddingTopLeft[0]
        && box.right <= mapBox.right - paddingBottomRight[0]
        && box.top >= mapBox.top + paddingTopLeft[1] && box.bottom <= mapBox.bottom - paddingBottomRight[1];
      const crosses = occupied.some(other => box.left < other.right + 5 && box.right > other.left - 5
        && box.top < other.bottom + 5 && box.bottom > other.top - 5);
      const show = inFrame && !crosses;
      element.style.visibility = show ? '' : 'hidden';
      if (show) occupied.push(box);
    });
  }
  map.on('moveend resize', positionLabels);

  function update({areaId = active, matchedIds = matches, zoom = map.getZoom(), focusRecord = false} = {}, force = false) {
    if (!areas.size) return;
    const area = getArea(areaId);
    const nextId = area?.properties.areaId || '';
    const nextMode = areaMode(area, zoom, focusRecord);
    if (!force && active === nextId && mode === nextMode && matches === matchedIds) return;
    [active, mode, matches] = [nextId, nextMode, matchedIds];
    select.value = active;
    layer?.remove();
    labelGroup?.remove();
    labelGroup = null;
    legend.hidden = mode === 'places';
    if (mode === 'places') {
      if (area) layer = L.geoJSON(area, {pane: 'gebiete', renderer, style: OUTLINE, interactive: false}).addTo(map);
      return;
    }
    const far = mode === 'districts';
    const visibleAreas = far ? districts : neighborhoods.filter(candidate => candidate.properties.parentId === active);
    const counts = areaCounts(visibleAreas, matchedIds);
    const breaks = breaksFor(visibleAreas, counts, far);
    const paint = feature => {
      const count = counts.get(feature.properties.areaId);
      const level = breaks.filter(boundary => count >= boundary).length;
      return {...(far ? BZ_LINE : NAV_LINE), fillColor: `url(#nav-c${level})`};
    };
    layer = L.geoJSON(visibleAreas, {
      pane: 'gebiete', renderer, style: paint,
      onEachFeature(feature, path) {
        const {name, areaId: id} = feature.properties;
        const tooltip = doc.createElement('div');
        const title = doc.createElement('strong');
        title.textContent = name;
        const total = doc.createElement('div');
        const count = counts.get(id);
        total.textContent = count === null ? 'Vorgänge werden geladen …' : `${number.format(count)} verortete Vorgänge`;
        const hint = doc.createElement('span');
        hint.className = 'nav-dim';
        hint.textContent = far ? 'Stadtteile ansehen' : 'Orte ansehen';
        tooltip.append(title, total, hint);
        path.bindTooltip(tooltip, {sticky: true, className: 'nav-tip'});
        path.on({
          add() { path.getElement()?.setAttribute('data-area-id', id); },
          mouseover() {
            path.setStyle(GLASS).bringToFront();
            path.getElement()?.setAttribute('filter', 'url(#nav-glow)');
          },
          mouseout() {
            path.setStyle(paint(feature));
            path.getElement()?.removeAttribute('filter');
          },
          click() { selectArea(id); },
        });
      },
    }).addTo(map);
    navDefs(renderer, doc);
    const ranked = [...visibleAreas].sort((a, b) => (counts.get(b.properties.areaId) || 0) - (counts.get(a.properties.areaId) || 0));
    labelGroup = L.layerGroup(ranked.map(item => label(item, counts.get(item.properties.areaId), far))).addTo(map);
    positionLabels();
    updateLegend(legend, breaks, far, matchedIds !== null);
  }

  return {setData, update, getArea, getBounds, get mode() { return mode; }};
}
