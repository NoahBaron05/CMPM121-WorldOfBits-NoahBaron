// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// Constants-------------------------------------------------------------------------------------------------
const CONST = {
  SPAWN_POINT: leaflet.latLng(
    (await playerCurrentPosition()).lat,
    (await playerCurrentPosition()).lng,
  ),
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

function playerCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position: GeolocationPosition) => {
        const { latitude: lat, longitude: lng } = position.coords;
        resolve({ lat, lng });
      },
    );
  });
}

// Flyweight pattern implementation--------------------------------------------------------------------------------
class Flyweight {
  constructor(public readonly bounds: leaflet.LatLngBounds) {}

  createRectangle(): leaflet.Rectangle {
    return leaflet.rectangle(this.bounds);
  }
}

class FlyweightFactory {
  private flyweights = new Map<string, Flyweight>();

  get(cell: Cell): Flyweight {
    const key = cellKey(cell);
    if (!this.flyweights.has(key)) {
      const bounds = cellToBounds(cell);
      this.flyweights.set(key, new Flyweight(bounds));
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

// Cell class setup ------------------------------------------------------------------------------------------------------------
class ActiveCell {
  tooltip: leaflet.Tooltip | null = null;

  constructor(
    public cell: Cell,
    public rect: leaflet.Rectangle,
    public token: token,
  ) {}

  updateUI(playerPos: leaflet.LatLng) {
    const center = this.rect.getBounds().getCenter();
    const distance = map.distance(center, playerPos);

    if (distance > CONST.MAX_REACH_DISTANCE) {
      this.rect.setStyle(CONST.STYLE.UNREACHABLE);
    } else {
      this.rect.setStyle(CONST.STYLE.REACHABLE);
    }

    this.updateTooltip();
  }

  updateTooltip() {
    if (this.token.value === 0) {
      if (this.tooltip) {
        this.rect.unbindTooltip();
        this.tooltip = null;
      }
      return;
    }

    if (!this.tooltip) {
      this.tooltip = leaflet
        .tooltip({
          permanent: true,
          direction: "center",
          className: "token-tooltip",
        });
      this.rect.bindTooltip(this.tooltip);
    }
    this.tooltip.setContent(String(this.token.value));
  }
}

class CellManager {
  private activeCells = new Map<string, ActiveCell>();

  constructor(
    private flyweights: FlyweightFactory,
    private mementos: MementoManager,
  ) {}

  spawn(cell: Cell) {
    const key = cellKey(cell);
    if (this.activeCells.has(key)) return;

    const saved = this.mementos.restore(key);

    if (saved === null) return;

    const rect = this.flyweights.get(cell).createRectangle().addTo(map);

    const tokenVal = (saved !== undefined)
      ? saved // Load interacted-with value
      : getInitialTokenValue(cell); // Natural spawn

    const active = new ActiveCell(cell, rect, { value: tokenVal });
    this.activeCells.set(key, active);

    rect.on("click", () => this.handleClick(active));
    active.updateUI(playerLocation.getLatLng());
  }

  resetUI() {
    for (const key of this.activeCells.keys()) {
      this.destroy(key);
    }
    this.activeCells.clear();
  }

  destroy(key: string) {
    const cell = this.activeCells.get(key);
    if (!cell) return;

    if (cell.tooltip) {
      cell.tooltip.remove();
      cell.rect.unbindTooltip();
      cell.tooltip = null;
    }

    cell.rect.off();
    cell.rect.remove();
    this.activeCells.delete(key);
  }

  handleClick(active: ActiveCell) {
    const center = active.rect.getBounds().getCenter();
    if (
      map.distance(center, playerLocation.getLatLng()) >
        CONST.MAX_REACH_DISTANCE
    ) return;

    const oldVal = active.token.value;

    tokenTransfer(active.token);

    if (active.token.value !== oldVal) {
      this.mementos.save(active.cell, active.token.value);
    }

    active.updateUI(playerLocation.getLatLng());
    updateInventoryDisplay();
  }

  updateAll(playerPosition: leaflet.LatLng) {
    for (const cell of this.activeCells.values()) {
      cell.updateUI(playerPosition);
    }
  }

  removeAllExcept(desiredKeys: Set<string>) {
    for (const key of this.activeCells.keys()) {
      if (!desiredKeys.has(key)) {
        this.destroy(key);
      }
    }
  }
}

const cellManager = new CellManager(flyweightFactory, mementoManager);

// Map Setup---------------------------------------------------------------------------------------------------------------
const map = createMap();

navigator.geolocation.watchPosition((pos) => {
  const newPos = leaflet.latLng(pos.coords.latitude, pos.coords.longitude);
  playerLocation.setLatLng(newPos);
  map.panTo(newPos);
  generateWorld();
});

const playerLocation = leaflet.marker(CONST.SPAWN_POINT).addTo(map);

navigator.geolocation.watchPosition(
  (position) => {
    const { latitude, longitude } = position.coords;
    const newPos = leaflet.latLng(latitude, longitude);

    // Update player marker
    playerLocation.setLatLng(newPos);

    // Keep camera centered
    map.panTo(newPos);

    // Recalculate visible world + UI
    generateWorld();
  },
  (error) => {
    console.warn("GPS error:", error.message);
  },
  { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 },
);

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

function tokenTransfer(token: token) {
  const hasPlayer = playerInventory.value !== 0;
  const hasCell = token.value !== 0;

  if (hasCell && !hasPlayer) {
    playerInventory.value = token.value;
    token.value = 0;
    winCondition(playerInventory.value, CONST.WIN_COUNT);
  } else if (!hasCell && hasPlayer) {
    token.value = playerInventory.value;
    playerInventory.value = 0;
  } else if (hasCell && token.value === playerInventory.value) {
    token.value += playerInventory.value;
    playerInventory.value = 0;
    winCondition(token.value, CONST.WIN_COUNT);
  }
}

function getVisibleCells(bounds: leaflet.LatLngBounds) {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  const minI = Math.floor(southWest.lat / CONST.TILE_DEGREES) - 1;
  const maxI = Math.floor(northEast.lat / CONST.TILE_DEGREES) + 1;
  const minJ = Math.floor(southWest.lng / CONST.TILE_DEGREES) - 1;
  const maxJ = Math.floor(northEast.lng / CONST.TILE_DEGREES) + 1;

  return { minI, maxI, minJ, maxJ };
}

// Cache Logic ----------------------------------------------------------------------------------------------------------------------------
function getInitialTokenValue(cell: Cell): number {
  const key = cellKey(cell);
  const saved = mementoManager.restore(key);
  if (saved !== undefined) return saved as number;

  const roll = luck(key);
  return roll < CONST.RECTANGLE_SPAWN_PROBABILITY ? 1 : 0;
}

// Spawn cells in when they are inside the screen (and fully clean them up when they leave)
function generateWorld() {
  const bounds = map.getBounds();
  const { minI, maxI, minJ, maxJ } = getVisibleCells(bounds);

  const desiredKeys = new Set<string>();

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      desiredKeys.add(cellKey({ i, j }));
      cellManager.spawn({ i, j });
    }
  }

  cellManager.removeAllExcept(desiredKeys);

  cellManager.updateAll(playerLocation.getLatLng());
}

function movePlayer(dx: number, dy: number) {
  const current = playerLocation.getLatLng();
  const newLat = current.lat + dy * CONST.TILE_DEGREES;
  const newLng = current.lng + dx * CONST.TILE_DEGREES;
  const newPos = leaflet.latLng(newLat, newLng);
  playerLocation.setLatLng(newPos);
  map.panTo(newPos);
  generateWorld();
}

// Event listeners --------------------------------------------------------------------------------------------------------
map.whenReady(() => {
  generateWorld();
});

map.on("moveend", () => {
  generateWorld();
});

dpad.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).id;
  if (btn === "up") movePlayer(0, 1);
  else if (btn === "down") movePlayer(0, -1);
  else if (btn === "left") movePlayer(-1, 0);
  else if (btn === "right") movePlayer(1, 0);
});

generateWorld();
