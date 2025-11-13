// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// Constants-------------------------------------------------------------------------------------------------
const CONST = {
  SPAWN_POINT: leaflet.latLng(57.476538, -4.225123),
  RECTANGLE_SPAWN_PROBABILITY: 0.2,
  GAMEPLAY_ZOOM_LEVEL: 19,
  TILE_DEGREES: 1e-4,
  MAX_REACH_DISTANCE: 28,
  WIN_COUNT: 16,
  STYLE: {
    REACHABLE: { color: "#3388ff", fillColor: "#3388ff", fillOpacity: 0.2 },
    UNREACHABLE: { color: "#999999", fillColor: "#999999", fillOpacity: 0.2 },
  },
} as const;

// Game State-----------------------------------------------------------------------------------------------------
interface token {
  value: number;
}

const playerInventory: token = {
  value: 0,
};

type Cell = { i: number; j: number };

interface ActiveCell {
  cell: Cell;
  rect: leaflet.Rectangle;
  rectToken: token;
  update: () => void;
}

const activeCells = new Map<string, ActiveCell>();

// Flyweight pattern implementation--------------------------------------------------------------------------------
class CellFlyweight {
  constructor(public readonly bounds: leaflet.LatLngBounds) {}

  createRectangle(): leaflet.Rectangle {
    return leaflet.rectangle(this.bounds);
  }
}

class FlyweightFactory {
  private flyweights = new Map<string, CellFlyweight>();

  get(cell: Cell): CellFlyweight {
    const key = cellKey(cell);
    if (!this.flyweights.has(key)) {
      const bounds = cellToBounds(cell);
      this.flyweights.set(key, new CellFlyweight(bounds));
    }
    return this.flyweights.get(key)!;
  }
}

const flyweightFactory = new FlyweightFactory();

// Memento Pattern implementation-------------------------------------------------------------------------------
interface Memento {
  key: string;
  // `null` means the cache empty by interaction;
  // a `number` means the persisted token value for the cell (including 0).
  token: number | null;
}

class MementoManager {
  private mementos = new Map<string, Memento>();

  save(cell: Cell, token: number | null) {
    this.mementos.set(cellKey(cell), { key: cellKey(cell), token });
  }

  // Returns:
  // - `number` when a numeric memento exists,
  // - `null` when a memento explicitly records deletion (non-existent),
  // - `undefined` when there's no memento for the key.
  restore(key: string): number | null | undefined {
    if (!this.mementos.has(key)) return undefined;
    return this.mementos.get(key)!.token;
  }

  getAll(): Memento[] {
    return Array.from(this.mementos.values());
  }
}

const mementoManager = new MementoManager();

// Map Setup---------------------------------------------------------------------------------------------------------------
const map = createMap();
const playerLocation = leaflet.marker(CONST.SPAWN_POINT).addTo(map);

// UI Elements -------------------------------------------------------------------------------------------------------------------
const inventoryDiv = document.createElement("div");
inventoryDiv.id = "inventory";
inventoryDiv.innerText = "\nInventory: ";
inventoryDiv.style.fontSize = "32px";
document.body.append(inventoryDiv);

const dpad = document.createElement("div");
dpad.id = "dpad";
dpad.innerHTML = `
  <div class="dpad-cell"></div>
  <button id="up" class="dpad-button">⬆</button>
  <div class="dpad-cell"></div>

  <button id="left" class="dpad-button">⬅</button>
  <div class="dpad-center"></div>
  <button id="right" class="dpad-button">➡</button>

  <div class="dpad-cell"></div>
  <button id="down" class="dpad-button">⬇</button>
  <div class="dpad-cell"></div>
`;
document.body.append(dpad);

// Functions ---------------------------------------------------------------------------------------------------------
function createMap(): leaflet.Map {
  const mapDiv = document.createElement("div");
  mapDiv.id = "map";
  document.body.append(mapDiv);

  const map = leaflet.map(mapDiv, {
    center: CONST.SPAWN_POINT,
    zoom: CONST.GAMEPLAY_ZOOM_LEVEL,
    minZoom: CONST.GAMEPLAY_ZOOM_LEVEL,
    maxZoom: CONST.GAMEPLAY_ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: CONST.GAMEPLAY_ZOOM_LEVEL,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map);

  return map;
}

function updateInventoryDisplay() {
  inventoryDiv.innerText = `Inventory: ${playerInventory.value || ""}`;
}

function winCondition(currentToken: number, winCount: number) {
  if (currentToken == winCount) {
    const winDiv = document.createElement("div");
    winDiv.id = "win";
    winDiv.innerText = "\nCongratulations! You won!";
    winDiv.style.fontSize = "32px";
    document.body.append(winDiv);
  }
}

function cellKey(c: Cell) {
  return `${c.i},${c.j}`;
}

// Converts a cell id to Leaflet LatLngBounds
function cellToBounds(c: Cell): leaflet.LatLngBounds {
  const topLeftLat = c.i * CONST.TILE_DEGREES;
  const topLeftLng = c.j * CONST.TILE_DEGREES;
  const bottomRightLat = (c.i + 1) * CONST.TILE_DEGREES;
  const bottomRightLng = (c.j + 1) * CONST.TILE_DEGREES;
  return leaflet.latLngBounds(
    leaflet.latLng(topLeftLat, topLeftLng),
    leaflet.latLng(bottomRightLat, bottomRightLng),
  );
}

function destroyActiveCell(key: string) {
  const active = activeCells.get(key);
  if (!active) return;
  active.rect.off();
  active.rect.unbindTooltip();
  active.rect.remove();
  activeCells.delete(key);
}

// Cache Logic ----------------------------------------------------------------------------------------------------------------------------
function getInitialTokenValue(cell: Cell): number {
  const key = cellKey(cell);
  const saved = mementoManager.restore(key);
  if (saved) return saved;

  const roll = luck(key);
  return roll < CONST.RECTANGLE_SPAWN_PROBABILITY ? 1 : 0;
}

function spawnCache(cell: Cell) {
  const key = cellKey(cell);
  if (activeCells.has(key)) return;

  const saved = mementoManager.restore(key);
  if (saved === null) return;

  const flyweight = flyweightFactory.get(cell);
  const rect = flyweight.createRectangle().addTo(map);

  const rectToken: token = {
    value: typeof saved === "number" ? saved : getInitialTokenValue(cell),
  };

  const tooltip: leaflet.Tooltip | null = null;
  const center = rect.getBounds().getCenter();

  // click behavior (mutations are in-memory only while active)
  const onClick = () => {
    const distance = map.distance(center, playerLocation.getLatLng());
    if (distance > CONST.MAX_REACH_DISTANCE) return;

    cellOperations(cell, key, rectToken);

    updateRectUI(rect, rectToken, center, tooltip);
    ensureCellsInView();
  };

  rect.on("click", onClick);
  const active: ActiveCell = {
    cell,
    rect,
    rectToken,
    update: () => updateRectUI(rect, rectToken, center, tooltip),
  };
  activeCells.set(key, active);
  updateRectUI(rect, rectToken, center, tooltip);
}

function updateRectUI(
  rect: leaflet.Rectangle,
  rectToken: token,
  center: leaflet.LatLng,
  tooltip: leaflet.Tooltip | null,
) {
  const distance = map.distance(center, playerLocation.getLatLng());

  // style based on reach
  if (distance > CONST.MAX_REACH_DISTANCE) {
    rect.setStyle(CONST.STYLE.UNREACHABLE);
  } else {
    rect.setStyle(CONST.STYLE.REACHABLE);
  }

  tooltip = updateTooltip(tooltip, rect, rectToken);

  updateInventoryDisplay();
}

function updateTooltip(
  tooltip: leaflet.Tooltip | null,
  rect: leaflet.Rectangle,
  rectToken: token,
) {
  if (rectToken.value !== 0) {
    if (tooltip) {
      tooltip.setContent(rectToken.value.toString());
    } else {
      tooltip = leaflet
        .tooltip({
          permanent: true,
          direction: "center",
          className: "token-tooltip",
        })
        .setContent(rectToken.value.toString());
      rect.bindTooltip(tooltip);
    }
  } else {
    if (tooltip) {
      rect.unbindTooltip();
      tooltip = null;
    }
  }
  return tooltip;
}

function cellOperations(
  cell: Cell,
  key: string,
  rectToken: token,
) {
  const hasPlayerToken = playerInventory.value !== 0;
  const hasRectangleToken = rectToken.value !== 0;
  const before = rectToken.value;

  if (hasRectangleToken && !hasPlayerToken) {
    playerInventory.value = rectToken.value;
    rectToken.value = 0;
    winCondition(playerInventory.value!, CONST.WIN_COUNT);
  } else if (!hasRectangleToken && hasPlayerToken) {
    rectToken.value = playerInventory.value;
    playerInventory.value = 0;
  } else if (rectToken.value == playerInventory.value && hasRectangleToken) {
    rectToken.value += playerInventory.value;
    playerInventory.value = 0;
    winCondition(rectToken.value, CONST.WIN_COUNT);
  }

  const after = rectToken.value;
  if (before !== after) {
    if (after === 0) {
      destroyActiveCell(key);
      mementoManager.save(cell, null);
      updateInventoryDisplay();
    }

    mementoManager.save(cell, after);
  }
}

// Spawn cells in when they are inside the screen (and fully clean them up when they leave)
function ensureCellsInView() {
  const bounds = map.getBounds();
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  const minI = Math.floor(southWest.lat / CONST.TILE_DEGREES) - 1;
  const maxI = Math.floor(northEast.lat / CONST.TILE_DEGREES) + 1;
  const minJ = Math.floor(southWest.lng / CONST.TILE_DEGREES) - 1;
  const maxJ = Math.floor(northEast.lng / CONST.TILE_DEGREES) + 1;

  const desired = new Set<string>();
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      const cell = { i, j } as Cell;
      const key = cellKey(cell);
      desired.add(cellKey({ i, j }));
      if (!activeCells.has(key)) {
        spawnCache(cell);
      }
    }
  }

  for (const key of Array.from(activeCells.keys())) {
    if (!desired.has(key)) destroyActiveCell(key);
  }

  // refresh remaining active cells
  for (const active of activeCells.values()) active.update();
}

function generateWorld() {
  ensureCellsInView();
}

function movePlayer(dx: number, dy: number) {
  const current = playerLocation.getLatLng();
  const newLat = current.lat + dy * CONST.TILE_DEGREES;
  const newLng = current.lng + dx * CONST.TILE_DEGREES;
  const newPos = leaflet.latLng(newLat, newLng);
  playerLocation.setLatLng(newPos);
  map.panTo(newPos);
  ensureCellsInView();
}

// Event listeners --------------------------------------------------------------------------------------------------------
map.whenReady(() => {
  ensureCellsInView();
});

map.on("moveend", () => {
  ensureCellsInView();
});

dpad.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).id;
  if (btn === "up") movePlayer(0, 1);
  else if (btn === "down") movePlayer(0, -1);
  else if (btn === "left") movePlayer(-1, 0);
  else if (btn === "right") movePlayer(1, 0);
});

// World Generation -------------------------------------------------------------------------------------------------------------
generateWorld();
