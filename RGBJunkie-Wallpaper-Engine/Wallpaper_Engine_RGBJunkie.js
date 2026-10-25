/**
 * RGBJunkie live wallpaper companion plugin.
 * Publisher: I'm Not MentaL
 * SPDX-License-Identifier: MIT
 *
 * Lights3D install: copy this file to %APPDATA%\RGBJunkie-L3D\plugins\
 * This plugin is the helper sender (UDP 8133 main, 8134 second). Lights3D
 * still samples virtual monitors on the desk. It does not send color or
 * settings packets while this file is loaded. Color packets are 0x00
 * (max 480 LEDs each). Settings packets are 0x01 plus a width,height trailer.
 */

/* global
discovery:readonly
controller:readonly
service:readonly
udp:readonly
ShutdownEffect:readonly
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
MatrixSize:readonly
MatrixTier:readonly
BlurIntensity:readonly
LedShape:readonly
RoundedRectangleCornerRadius:readonly
LedPadding:readonly
FPS:readonly
ShowFps:readonly
BackgroundColor:readonly
CoverImage:readonly
CoverImageStretch:readonly
*/

export const rgbjunkie = {
	abiVersion: 1,
	displayName: "Live Wallpaper",
	publisher: "I'm Not MentaL",
	match: { vendorId: 0, productIds: [] },
	validateEndpoint: () => false,
	transportType: "network",
	deviceKind: "wallpaper",
	imageUrl: "",
	size: [32, 18],
	defaultPosition: [50, 50],
	defaultScale: 0.2,
	settings: [
		{ id: "ShutdownEffect", group: "lighting", label: "Shutdown Effect", description: "Applied when RGBJunkie or the system shuts down.", type: "combobox", values: ["Solid Color", "Aurora", "Breathing", "Rainbow Wave (Left)", "Rainbow Wave (Right)", "Neon Wave (Left)", "Neon Wave (Right)", "Sunset Wave (Left)", "Sunset Wave (Right)", "Audio Party", "Rainbow Cycle", "Rainbow Pinwheel", "Fire"], default: "Solid Color" },
		{ id: "shutdownColor", group: "lighting", label: "Shutdown Color", description: "Color used on shutdown.", type: "color", default: "#009bde", min: "0", max: "360" },
		{ id: "LightingMode", group: "lighting", label: "Lighting Mode", description: "Canvas pulls from the active effect; Forced uses a single color.", type: "combobox", values: ["Canvas", "Forced"], default: "Canvas" },
		{ id: "forcedColor", group: "lighting", label: "Forced Color", description: "Color when Lighting Mode is Forced.", type: "color", default: "#009bde", min: "0", max: "360" },
		{ id: "MatrixSize", group: "settings", label: "Aspect Ratio", description: "Screen aspect ratio for the virtual LED grid.", type: "combobox", values: ["4:1 Landscape", "4:1 Portrait", "4:3 Landscape", "4:3 Portrait", "5:4 Landscape", "5:4 Portrait", "16:9 Landscape", "16:9 Portrait", "16:10 Landscape", "16:10 Portrait", "21:9 Landscape", "21:9 Portrait", "32:9 Landscape", "32:9 Portrait"], default: "16:9 Landscape" },
		{ id: "MatrixTier", group: "settings", label: "Display Size", description: "Grid density tier.", type: "combobox", values: ["Small", "Normal", "Large", "X Large"], default: "Normal" },
		{ id: "BlurIntensity", group: "lighting", label: "Blur Intensity", description: "LED glow / diffusion amount.", type: "number", min: "0", max: "100", step: "1", default: "20" },
		{ id: "LedShape", group: "lighting", label: "LED Shape", description: "Virtual LED shape on the wallpaper.", type: "combobox", values: ["Rectangle", "Rounded Rectangle", "Circle"], default: "Rectangle" },
		{ id: "RoundedRectangleCornerRadius", group: "lighting", label: "Rounded Rectangle Corner Radius", description: "Corner radius when LED Shape is Rounded Rectangle.", type: "number", min: "0", max: "20", step: "1", default: "2" },
		{ id: "LedPadding", group: "lighting", label: "LED Padding", description: "Spacing between virtual LEDs.", type: "number", min: "0", max: "250", step: "1", default: "0" },
		{ id: "FPS", label: "Target FPS", description: "Wallpaper animation frame rate.", type: "number", min: "1", max: "240", step: "1", default: "60" },
		{ id: "ShowFps", group: "settings", label: "Show FPS", description: "Overlay FPS on the wallpaper.", type: "boolean", default: "false" },
		{ id: "BackgroundColor", group: "settings", label: "Background Color", description: "Wallpaper background color.", type: "color", default: "#000000", min: "0", max: "360" },
		{ id: "CoverImage", label: "Cover Image", type: "string", browse: "image", description: "Diffuser image (local path or URL).", default: "" },
		{ id: "CoverImageStretch", group: "settings", label: "Cover Image Stretch", description: "How the cover image is scaled.", type: "combobox", values: ["None", "Fill", "Uniform", "Uniform to Fill"], default: "Uniform" },
	],
};

export function version() {
	return "2.0.0";
}

const MaxLedsInPacket = 480;
const ColorPacket = 0x00;
const SettingPacket = 0x01;

const vMatrixSize = { "4:3 Landscape": 0, "4:3 Portrait": 1, "5:4 Landscape": 2, "5:4 Portrait": 3, "16:9 Landscape": 4, "16:9 Portrait": 5, "16:10 Landscape": 6, "16:10 Portrait": 7, "21:9 Landscape": 8, "21:9 Portrait": 9, "32:9 Landscape": 10, "32:9 Portrait": 11, "4:1 Landscape": 12, "4:1 Portrait": 13 };
const vMatrixTier = { "Small": 0, "Normal": 1, "Large": 2, "X Large": 3 };
const vShutdownEffect = {
	"Solid Color": 0, "Aurora": 1, "Breathing": 2, "Rainbow Wave (Left)": 3, "Rainbow Wave (Right)": 4, "Neon Wave (Left)": 5, "Neon Wave (Right)": 6,
	"Sunset Wave (Left)": 7, "Sunset Wave (Right)": 8, "Audio Party": 9, "Rainbow Cycle": 10, "Rainbow Pinwheel": 11, "Fire": 12
};
const vLedShape = { "Rectangle": 0, "Rounded Rectangle": 1, "Circle": 2, "Sphere": 2 };
const vCoverImageStretch = { "None": 0, "Fill": 1, "Uniform": 2, "Uniform to Fill": 3 };
// Positions and names are built lazily for the active layout only. Building
// every aspect and tier up front allocated tens of thousands of arrays that
// most sessions never use.
const ledPositionsCache = new Map();
const ledNamesCache = new Map();

function ledPositionsFor(matrixSize, matrixTier) {
	const size = vLedSizes[matrixSize] && vLedSizes[matrixSize][matrixTier];
	if (!size) return null;
	const key = matrixSize + "\0" + matrixTier;
	let positions = ledPositionsCache.get(key);
	if (!positions) {
		positions = generateLedPositions(size[0], size[1]);
		ledPositionsCache.set(key, positions);
	}
	return positions;
}

function ledNamesFor(matrixSize, matrixTier) {
	const size = vLedSizes[matrixSize] && vLedSizes[matrixSize][matrixTier];
	if (!size) return null;
	const count = size[0] * size[1];
	let names = ledNamesCache.get(count);
	if (!names) {
		names = generateLedNames(count);
		ledNamesCache.set(count, names);
	}
	return names;
}
const vLedSizes = {
	"4:1 Landscape": { "Small": [8, 2], "Normal": [16, 4], "Large": [32, 8], "X Large": [64, 16] },
	"4:1 Portrait": { "Small": [2, 8], "Normal": [4, 16], "Large": [8, 32], "X Large": [16, 64] },
	"4:3 Landscape": { "Small": [8, 6], "Normal": [16, 12], "Large": [32, 24], "X Large": [64, 48] },
	"4:3 Portrait": { "Small": [6, 8], "Normal": [12, 16], "Large": [24, 32], "X Large": [48, 64] },
	"5:4 Landscape": { "Small": [10, 8], "Normal": [20, 16], "Large": [40, 32], "X Large": [80, 64] },
	"5:4 Portrait": { "Small": [8, 10], "Normal": [16, 20], "Large": [32, 40], "X Large": [64, 80] },
	"16:9 Landscape": { "Small": [32, 18], "Normal": [48, 27], "Large": [64, 36], "X Large": [128, 72] },
	"16:9 Portrait": { "Small": [18, 32], "Normal": [27, 48], "Large": [36, 64], "X Large": [72, 128] },
	"16:10 Landscape": { "Small": [32, 20], "Normal": [48, 30], "Large": [64, 40], "X Large": [128, 80] },
	"16:10 Portrait": { "Small": [20, 32], "Normal": [30, 48], "Large": [40, 64], "X Large": [80, 128] },
	"21:9 Landscape": { "Small": [42, 18], "Normal": [63, 27], "Large": [84, 36], "X Large": [168, 72] },
	"21:9 Portrait": { "Small": [18, 42], "Normal": [27, 63], "Large": [36, 84], "X Large": [72, 168] },
	"32:9 Landscape": { "Small": [64, 18], "Normal": [96, 27], "Large": [128, 36], "X Large": [256, 72] },
	"32:9 Portrait": { "Small": [18, 64], "Normal": [27, 96], "Large": [36, 128], "X Large": [72, 256] }
};
let __rgbjWallpaperGridPrimed = false;
let __rgbjWallpaperLastMatrixKey = "";

const RGBJ_WALLPAPER_DEFAULT_MATRIX = "16:9 Landscape";
const RGBJ_WALLPAPER_DEFAULT_TIER = "Normal";

function isLoopbackIp(ip) {
	if (typeof ip !== "string") return false;
	const value = ip.trim().toLowerCase();
	return (
		value === "127.0.0.1" ||
		value === "::1" ||
		value === "[::1]" ||
		value === "localhost" ||
		/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)
	);
}

function wallpaperTarget() {
	// The companion only ever listens on loopback (8133 main, 8134 second).
	// A controller record pointing anywhere else would leak the cover image
	// path from the settings packet and stream canvas colours off machine,
	// so anything non loopback or off port falls back to the main endpoint.
	if (typeof controller !== "undefined" && controller && isLoopbackIp(controller.ip)) {
		const port = Number(controller.port) | 0;
		if (port === 8133 || port === 8134) {
			const name =
				typeof controller.name === "string" && controller.name ? controller.name : "Live Wallpaper";
			return { name, ip: controller.ip.trim(), port };
		}
	}
	return { name: "Live Wallpaper", ip: "127.0.0.1", port: 8133 };
}

function wallpaperSend(packet) {
	if (typeof udp === "undefined" || !udp || typeof udp.send !== "function") {
		return;
	}
	if (!Array.isArray(packet) || packet.length === 0) {
		return;
	}
	const target = wallpaperTarget();
	try {
		udp.send(target.ip, target.port, packet);
	} catch (_e) {
		// A missing companion must not throw out of the render loop.
	}
}

function rgbjWallpaperLayoutKeys() {
	const ms =
		typeof MatrixSize !== "undefined" && MatrixSize != null && vLedSizes[MatrixSize]
			? MatrixSize
			: RGBJ_WALLPAPER_DEFAULT_MATRIX;
	const mt =
		typeof MatrixTier !== "undefined" && MatrixTier != null && vLedSizes[ms] && vLedSizes[ms][MatrixTier]
			? MatrixTier
			: RGBJ_WALLPAPER_DEFAULT_TIER;
	return { ms, mt };
}

function rgbjWallpaperLayoutBundle() {
	const { ms, mt } = rgbjWallpaperLayoutKeys();
	const names = ledNamesFor(ms, mt);
	const positions = ledPositionsFor(ms, mt);
	const size = vLedSizes[ms] && vLedSizes[ms][mt];
	if (!names || !positions || !size) {
		return null;
	}
	return { names, positions, size, matrixSize: ms, matrixTier: mt };
}

function rgbjWallpaperMatrixKey() {
	const { ms, mt } = rgbjWallpaperLayoutKeys();
	return String(ms) + "\0" + String(mt);
}

function syncMatrixLayout() {
	const bundle = rgbjWallpaperLayoutBundle();
	if (!bundle) {
		return false;
	}
	if (
		typeof device === "undefined" ||
		!device ||
		typeof device.setSize !== "function" ||
		typeof device.setControllableLeds !== "function"
	) {
		return false;
	}
	device.setSize(bundle.size);
	device.setControllableLeds(bundle.names, bundle.positions);
	__rgbjWallpaperGridPrimed = false;
	return true;
}

function syncMatrixLayoutIfNeeded() {
	const key = rgbjWallpaperMatrixKey();
	if (key === __rgbjWallpaperLastMatrixKey) return;
	// Only latch the key once the layout actually applied, so a failed sync
	// (host device not ready yet) is retried on the next frame.
	if (syncMatrixLayout()) {
		__rgbjWallpaperLastMatrixKey = key;
	}
}

export function onMatrixSizeChanged() {
	__rgbjWallpaperLastMatrixKey = "";
	syncMatrixLayout();
	updateSettings();
}

export function onMatrixTierChanged() {
	__rgbjWallpaperLastMatrixKey = "";
	syncMatrixLayout();
	updateSettings();
}

export function onShutdownEffectChanged() {
	updateSettings();
}

export function onShowFpsChanged() {
	updateSettings();
}

function rgbjWallpaperForceSettingsUdp() {
	__rgbjWallpaperLastSettingsKey = "";
}

export function onBlurIntensityChanged() {
	rgbjWallpaperForceSettingsUdp();
	updateSettings();
}

export function onLedShapeChanged() {
	rgbjWallpaperForceSettingsUdp();
	updateSettings();
}

export function onRoundedRectangleCornerRadiusChanged() {
	rgbjWallpaperForceSettingsUdp();
	updateSettings();
}

export function onLedPaddingChanged() {
	rgbjWallpaperForceSettingsUdp();
	updateSettings();
}

export function onFPSChanged() {
	const fps = Math.max(1, Math.min(240, Number(FPS) || 60));
	if (typeof device !== "undefined" && device && typeof device.setFrameRateTarget === "function") {
		device.setFrameRateTarget(fps);
	}
	updateSettings();
}

export function onCoverImageStretchChanged() {
	rgbjWallpaperForceSettingsUdp();
	updateSettings();
}

export function onCoverImageChanged() {
	__rgbjWallpaperLastSettingsKey = "";
	updateSettings();
}

export function onBackgroundColorChanged() {
	updateSettings();
}

export function getLedNames() {
	const bundle = rgbjWallpaperLayoutBundle();
	return bundle ? bundle.names : [];
}

export function getLedPositions() {
	const bundle = rgbjWallpaperLayoutBundle();
	return bundle ? bundle.positions : [];
}

export function getSize() {
	const bundle = rgbjWallpaperLayoutBundle();
	return bundle ? bundle.size : [32, 18];
}

export function getDisplayName() {
	return wallpaperTarget().name || "Live Wallpaper";
}

export function deviceConfiguration() {
	syncMatrixLayout();
}

export function initialize() {
	if (typeof device !== "undefined" && device) {
		if (typeof device.setName === "function") {
			device.setName(wallpaperTarget().name);
		}
		if (typeof device.addFeature === "function") {
			device.addFeature("udp");
		}
	}
	__rgbjWallpaperLastMatrixKey = "";
	syncMatrixLayout();
	const fps = Math.max(1, Math.min(240, Number(FPS) || 60));
	if (typeof device !== "undefined" && device && typeof device.setFrameRateTarget === "function") {
		device.setFrameRateTarget(fps);
	}
	updateSettings();
}

let __rgbjWallpaperSettingsResyncOnRender = false;
let __rgbjWallpaperLastSettingsKey = "";

function rgbjSettingBool(value) {
	return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function rgbjWallpaperLedShapeByte() {
	const raw = LedShape;
	if (raw != null && vLedShape[raw] !== undefined) return vLedShape[raw] | 0;
	const n = Number(raw);
	return n >= 0 && n <= 2 ? n | 0 : 0;
}

function rgbjWallpaperCoverStretchByte() {
	const raw = CoverImageStretch;
	if (raw != null && vCoverImageStretch[raw] !== undefined) return vCoverImageStretch[raw] | 0;
	const n = Number(raw);
	if (n >= 0 && n <= 3) return n | 0;
	return 2;
}

let __rgbjWallpaperLastInvalidWarnMs = 0;

function updateSettings() {
	const rawMatrixSize = typeof MatrixSize !== "undefined" ? MatrixSize : undefined;
	const rawMatrixTier = typeof MatrixTier !== "undefined" ? MatrixTier : undefined;
	const gridSize = vLedSizes[rawMatrixSize] && vLedSizes[rawMatrixSize][rawMatrixTier];
	const matrixIdx = vMatrixSize[rawMatrixSize];
	const tierIdx = vMatrixTier[rawMatrixTier];
	if (!gridSize || matrixIdx === undefined || tierIdx === undefined) {
		__rgbjWallpaperSettingsResyncOnRender = false;
		const now = Date.now();
		if (now - __rgbjWallpaperLastInvalidWarnMs > 30000) {
			__rgbjWallpaperLastInvalidWarnMs = now;
			try {
				console.warn(
					"[RGBJunkie][Wallpaper] invalid Aspect Ratio / Display Size:",
					rawMatrixSize,
					rawMatrixTier
				);
			} catch (_e) { /* ignore */ }
		}
		return;
	}
	const bgcolor = hexToRgb(BackgroundColor);
	const sdcolor = hexToRgb(shutdownColor);
	const blur = Math.max(0, Math.min(100, Number(BlurIntensity) || 0)) | 0;
	const corner = Math.max(0, Math.min(20, Number(RoundedRectangleCornerRadius) || 0)) | 0;
	const padding = Math.max(0, Math.min(250, Number(LedPadding) || 0)) | 0;
	const fps = Math.max(1, Math.min(240, Number(FPS) || 60)) | 0;
	let packet = [SettingPacket, matrixIdx, tierIdx, vShutdownEffect[ShutdownEffect] | 0, rgbjSettingBool(ShowFps) ? 1 : 0, blur,
		rgbjWallpaperLedShapeByte(), corner, padding, fps, rgbjWallpaperCoverStretchByte(), 0,
		bgcolor[0], bgcolor[1], bgcolor[2], sdcolor[0], sdcolor[1], sdcolor[2]];

	const coverImageBytes = stringToBytes(typeof CoverImage !== "undefined" ? CoverImage : "", 255);
	packet.push(coverImageBytes.length);
	packet.push(...coverImageBytes);
	packet.push(gridSize[0] & 255, gridSize[1] & 255);

	const settingsKey = packet.join(",");
	if (settingsKey === __rgbjWallpaperLastSettingsKey) return;
	__rgbjWallpaperLastSettingsKey = settingsKey;

	wallpaperSend(packet);
}

export function render() {
	if (typeof __rgbjSyncControllableParams === "function") {
		__rgbjSyncControllableParams();
	}
	syncMatrixLayoutIfNeeded();
	if (!__rgbjWallpaperSettingsResyncOnRender) {
		__rgbjWallpaperSettingsResyncOnRender = true;
		updateSettings();
	}
	grabColors();
}

export function resyncCompanionSettings() {
	__rgbjWallpaperLastSettingsKey = "";
	updateSettings();
}

export function shutdown(suspend) {
	void suspend;
	try {
		grabColors(true);
	} finally {
		// The companion may restart while the host is suspended. Clear the
		// dedupe flags so the next render resends settings and grid state
		// instead of assuming the companion still has them.
		__rgbjWallpaperGridPrimed = false;
		__rgbjWallpaperSettingsResyncOnRender = false;
		__rgbjWallpaperLastSettingsKey = "";
	}
}

function colourByte(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function grabColors(shutdown = false) {
	if (!shutdown && !__rgbjWallpaperGridPrimed) {
		__rgbjWallpaperLastSettingsKey = "";
		updateSettings();
		__rgbjWallpaperGridPrimed = true;
	}
	const bundle = rgbjWallpaperLayoutBundle();
	const positions = bundle ? bundle.positions : null;
	if (!Array.isArray(positions) || positions.length === 0) {
		return;
	}
	if (typeof device === "undefined" || !device || typeof device.color !== "function") {
		if (!shutdown && LightingMode !== "Forced") {
			return;
		}
	}
	const LedCount = positions.length;
	const NumPackets = Math.ceil(LedCount / MaxLedsInPacket);
	// Parse a fixed colour once per frame. The old loop ran the hex parser
	// for every LED, and built one full frame array only to splice and
	// concat it into packets (quadratic shifting on the large tiers).
	const fixedColor = shutdown
		? hexToRgb(shutdownColor)
		: LightingMode === "Forced"
			? hexToRgb(forcedColor)
			: null;

	let ledIdx = 0;
	for (let currPacket = 0; currPacket < NumPackets; currPacket++) {
		const ledsInPacket = Math.min(MaxLedsInPacket, LedCount - ledIdx);
		// One fresh array per packet: the host may retain it past the send
		// call, so packets are never pooled or reused across frames.
		const packet = new Array(3 + ledsInPacket * 3);
		packet[0] = ColorPacket;
		packet[1] = currPacket;
		packet[2] = NumPackets;
		let out = 3;
		for (let n = 0; n < ledsInPacket; n++, ledIdx++) {
			const pos = positions[ledIdx];
			const color = fixedColor || device.color(pos[0], pos[1]);
			if (color && color.length >= 3) {
				packet[out++] = colourByte(color[0]);
				packet[out++] = colourByte(color[1]);
				packet[out++] = colourByte(color[2]);
			} else {
				packet[out++] = 0;
				packet[out++] = 0;
				packet[out++] = 0;
			}
		}
		wallpaperSend(packet);
	}
}

function stringToBytes(str, maxBytes) {
	const bytes = [];
	const limit = typeof maxBytes === "number" && maxBytes >= 0 ? maxBytes : Infinity;
	// Control characters have no place in a cover path or URL and can break
	// line or log based handling on the receiving side, so drop them here.
	const s = String(str || "").replace(/[\u0000-\u001f\u007f]/g, "");
	for (const ch of s) {
		const code = ch.codePointAt(0);
		if (code < 0x80) {
			if (bytes.length + 1 > limit) break;
			bytes.push(code);
		} else if (code < 0x800) {
			if (bytes.length + 2 > limit) break;
			bytes.push(0xc0 | (code >> 6));
			bytes.push(0x80 | (code & 0x3f));
		} else if (code < 0x10000) {
			if (bytes.length + 3 > limit) break;
			bytes.push(0xe0 | (code >> 12));
			bytes.push(0x80 | ((code >> 6) & 0x3f));
			bytes.push(0x80 | (code & 0x3f));
		} else {
			// Astral characters arrive as one code point here. The old loop
			// dropped surrogate pairs outright and the byte cap could cut a
			// multi byte sequence in half, corrupting the path.
			if (bytes.length + 4 > limit) break;
			bytes.push(0xf0 | (code >> 18));
			bytes.push(0x80 | ((code >> 12) & 0x3f));
			bytes.push(0x80 | ((code >> 6) & 0x3f));
			bytes.push(0x80 | (code & 0x3f));
		}
	}
	return bytes;
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
	if (!result) return [0, 0, 0];
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}

function generateLedPositions(width, height) {
	const positions = [];

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			positions.push([x, y]);
		}
	}

	return positions;
}

function generateLedNames(count) {
	const names = [];

	for (let i = 1; i <= count; i++) {
		names.push(`Led ${i}`);
	}

	return names;
}

export function DiscoveryService() {
	this.IconUrl = "";
	this.Initialize = () => {
		if (typeof service === "undefined" || !service || typeof service.addController !== "function") {
			return;
		}
		service.addController(new Wallpaper({
			id: "Wallpaper",
			port: 8133,
			ip: "127.0.0.1",
			name: "Live Wallpaper",
		}));
		service.addController(new Wallpaper({
			id: "Wallpaper2",
			port: 8134,
			ip: "127.0.0.1",
			name: "Live Wallpaper (second screen)",
		}));

		const getController = typeof service.getController === "function" ? service.getController.bind(service) : () => null;
		const controllers = [getController("Wallpaper"), getController("Wallpaper2")];
		controllers.forEach(function (entry) {
			if (!entry) return;
			if (typeof service.updateController === "function") service.updateController(entry);
			if (typeof service.announceController === "function") service.announceController(entry);
		});

		updateSettings();
	};

	this.Update = () => {
		if (typeof service === "undefined" || !service || !Array.isArray(service.controllers)) {
			return;
		}
		for (const cont of service.controllers) {
			if (!cont || !cont.obj || typeof cont.obj.update !== "function") continue;
			cont.obj.update();
		}
	};
}

class Wallpaper {
	constructor(value) {
		this.id = value.id;
		this.port = value.port;
		this.ip = value.ip;
		this.name = value.name;

		this.initialized = false;
	}

	update() {
		if (!this.initialized) {
			this.initialized = true;

			if (typeof service !== "undefined" && service) {
				if (typeof service.updateController === "function") service.updateController(this);
				if (typeof service.announceController === "function") service.announceController(this);
			}
		}
	}
}

export function imageUrl() {
	return "";
}

export function LedNames() {
	return getLedNames();
}
export function LedPositions() {
	return getLedPositions();
}
export function Size() {
	return getSize();
}
export function Name() {
	return getDisplayName();
}
