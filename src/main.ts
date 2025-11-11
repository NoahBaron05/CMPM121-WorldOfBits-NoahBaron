// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// Constants-------------------------------------------------------------------------------------------------
const SPAWN_POINT = leaflet.latLng(57.476538, -4.225123);
const RECTANGLE_SPAWN_PROBABILITY = 0.2;

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE_X = 22;
const NEIGHBORHOOD_SIZE_Y = 6;
const MAX_REACH_DISTANCE = 25;

const WIN_COUNT: number = 2;

const reachableStyle = {
  color: "#3388ff",
  fillColor: "#3388ff",
  fillOpacity: 0.2,
};

const unreachableStyle = {
  color: "#999999",
  fillColor: "#999999",
  fillOpacity: 0.2,
};

// Game State-----------------------------------------------------------------------------------------------------
interface token {
  value: number;
}

const playerInventory: token = {
  value: 0,
};

// Map Setup---------------------------------------------------------------------------------------------------------------
function createMap(): leaflet.Map {
  const mapDiv = document.createElement("div");
  mapDiv.id = "map";
  document.body.append(mapDiv);

  const map = leaflet.map(mapDiv, {
    center: SPAWN_POINT,
    zoom: GAMEPLAY_ZOOM_LEVEL,
    minZoom: GAMEPLAY_ZOOM_LEVEL,
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: GAMEPLAY_ZOOM_LEVEL,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map);

  return map;
}

const map = createMap();
const playerLocation = leaflet.marker(SPAWN_POINT).addTo(map);

// UI Elements -------------------------------------------------------------------------------------------------------------------
const inventoryDiv = document.createElement("div");
inventoryDiv.id = "inventory";
inventoryDiv.innerText = "\nInventory: ";
document.body.append(inventoryDiv);

function updateInventoryDisplay() {
  inventoryDiv.innerText = `Inventory: ${playerInventory.value || ""}`;
}

function winCondition(currentToken: number, winCount: number) {
  if (currentToken == winCount) {
    const winDiv = document.createElement("div");
    winDiv.id = "win";
    winDiv.innerText = "\nCongratulations! You won!";
    document.body.append(winDiv);
  }
}

// Cache Logic ---------------------------------------------------------------------------------------------------------------
function spawnCache(i: number, j: number) {
  const origin = SPAWN_POINT;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  const roll = luck([i / 2, j].toString());
  const isToken = roll < RECTANGLE_SPAWN_PROBABILITY ? 1 : 0;

  const rectToken: token = {
    value: isToken,
  };

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  let tooltip: leaflet.Tooltip | null = null;

  const rectangleCenter = bounds.getCenter();

  function updateRectUI() {
    const distance = map.distance(rectangleCenter, playerLocation.getLatLng());

    // style based on reach
    if (distance > MAX_REACH_DISTANCE) {
      rect.setStyle(unreachableStyle);
    } else {
      rect.setStyle(reachableStyle);
    }

    // tooltip reflect token value: only show for non-zero tokens
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

    updateInventoryDisplay();
  }

  updateRectUI();

  // clicking a rectangle performs the action immediately (no popup)
  rect.on("click", () => {
    const distance = map.distance(rectangleCenter, playerLocation.getLatLng());

    // ignore clicks out of reach
    if (distance > MAX_REACH_DISTANCE) return;

    const hasPlayerToken = playerInventory.value !== 0;
    const hasRectangleToken = rectToken.value !== 0;

    // Actions
    if (hasRectangleToken && !hasPlayerToken) {
      // take token
      playerInventory.value = rectToken.value;
      rectToken.value = 0;
      updateRectUI();
      winCondition(playerInventory.value!, WIN_COUNT);
    } else if (!hasRectangleToken && hasPlayerToken) {
      // drop token
      rectToken.value = playerInventory.value;
      playerInventory.value = 0;
      updateRectUI();
    } else if (rectToken.value == playerInventory.value && hasRectangleToken) {
      // craft tokens (merge)
      rectToken.value! += playerInventory.value;
      playerInventory.value = 0;
      updateRectUI();
    } else {
      // no-op for other cases (e.g., both empty, or mismatch where no action was defined)
      updateRectUI();
    }
  });
}

// World Generation -------------------------------------------------------------------------------------------------------------
function generateWorld() {
  for (let i = -NEIGHBORHOOD_SIZE_Y; i < NEIGHBORHOOD_SIZE_Y; i++) {
    for (let j = -NEIGHBORHOOD_SIZE_X; j < NEIGHBORHOOD_SIZE_X; j++) {
      spawnCache(i, j);
    }
  }
}

generateWorld();
