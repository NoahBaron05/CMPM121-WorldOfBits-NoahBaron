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

  if (rectToken.value !== 0) {
    const tooltip = leaflet
      .tooltip({
        permanent: true,
        direction: "center",
        className: "token-tooltip",
      })
      .setContent(rectToken.value.toString());
    rect.bindTooltip(tooltip);
  }

  rect.bindPopup(() => {
    const rectangleCenter = bounds.getCenter();
    const playerPosition = playerLocation.getLatLng();
    const distance = map.distance(rectangleCenter, playerPosition);

    return createPopupContent({
      rectToken,
      inventoryDiv,
      rect,
      distance,
    });
  });
}

function createPopupContent(
  { rectToken, inventoryDiv, rect, distance }: {
    rectToken: token;
    inventoryDiv: HTMLElement;
    rect: leaflet.Rectangle;
    distance: number;
  },
) {
  const popupDiv = document.createElement("div");

  const close = () => rect.closePopup();

  let tooltip: leaflet.Tooltip | null =
    (rect.getTooltip && rect.getTooltip() as leaflet.Tooltip) || null;

  const update = () => {
    if (rectToken.value !== 0) {
      if (tooltip) {
        tooltip.setContent(rectToken.value.toString());
      } else {
        tooltip = leaflet.tooltip({
          permanent: true,
          direction: "center",
          className: "token-tooltip",
        }).setContent(rectToken.value.toString());
        rect.bindTooltip(tooltip);
      }
    } else {
      if (tooltip) {
        rect.unbindTooltip();
        tooltip = null;
      }
    }

    inventoryDiv.innerText = `Inventory: ${playerInventory.value || ""}`;
  };

  if (distance > MAX_REACH_DISTANCE) {
    popupDiv.innerHTML = `<p>Too far away</p><button id="close">Close</button>`;
    popupDiv.querySelector("#close")!.addEventListener("click", close);
    return popupDiv;
  }

  const hasPlayerToken = playerInventory.value !== 0;
  const hasRectangleToken = rectToken.value !== 0;

  if (!hasRectangleToken && !hasPlayerToken) {
    popupDiv.innerHTML =
      `<p>This cell is empty.</p><button id="close">Close</button>`;
    popupDiv.querySelector("#close")!.addEventListener("click", close);
  } else if (hasRectangleToken && !hasPlayerToken) {
    popupDiv.innerHTML =
      `<p>Token value: ${rectToken.value}</p><button id="take">Take Token</button>`;
    popupDiv.querySelector("#take")!.addEventListener("click", () => {
      playerInventory.value = rectToken.value;
      rectToken.value = 0;
      update();
      close();
      winCondition(playerInventory.value!, WIN_COUNT);
    });
  } else if (!hasRectangleToken && hasPlayerToken) {
    popupDiv.innerHTML =
      `<p>Token value: ${rectToken.value}</p><button id="drop">Drop token</button>`;
    popupDiv.querySelector("#drop")!.addEventListener("click", () => {
      rectToken.value = playerInventory.value;
      playerInventory.value = 0;
      update();
      close();
    });
  } else if (rectToken.value == playerInventory.value && hasRectangleToken) {
    popupDiv.innerHTML =
      `<p>Token value: ${rectToken.value}</p><button id="craft">Craft tokens</button>`;
    popupDiv.querySelector("#craft")!.addEventListener("click", () => {
      rectToken.value! += playerInventory.value;
      playerInventory.value = 0;
      update();
      close();
    });
  } else if (rectToken.value != playerInventory.value) {
    popupDiv.innerHTML =
      `<p>Token value: ${rectToken.value}</p><button id="close">Close popup</button>`;
    popupDiv.querySelector("#closeButton")!.addEventListener("click", close);
  } else {
    popupDiv.innerHTML = `Unexpected interaction`;
  }

  return popupDiv;
}

// World Generation -------------------------------------------------------------------------------------------------------------
function generateWorld() {
  for (let i = -NEIGHBORHOOD_SIZE_Y; i < NEIGHBORHOOD_SIZE_Y; i++) {
    for (let j = -NEIGHBORHOOD_SIZE_X; j < NEIGHBORHOOD_SIZE_X; j++) {
      if (luck([i, j].toString()) < RECTANGLE_SPAWN_PROBABILITY) {
        spawnCache(i, j);
      }
    }
  }
}

generateWorld();
