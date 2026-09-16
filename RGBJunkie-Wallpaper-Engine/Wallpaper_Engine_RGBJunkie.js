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
const vLedPositions = {
	"4:1 Landscape": { "Small": generateLedPositions(8, 2), "Normal": generateLedPositions(16, 4), "Large": generateLedPositions(32, 8), "X Large": generateLedPositions(64, 16) },
	"4:1 Portrait": { "Small": generateLedPositions(2, 8), "Normal": generateLedPositions(4, 16), "Large": generateLedPositions(8, 32), "X Large": generateLedPositions(16, 64) },
	"4:3 Landscape": { "Small": generateLedPositions(8, 6), "Normal": generateLedPositions(16, 12), "Large": generateLedPositions(32, 24), "X Large": generateLedPositions(64, 48) },
	"4:3 Portrait": { "Small": generateLedPositions(6, 8), "Normal": generateLedPositions(12, 16), "Large": generateLedPositions(24, 32), "X Large": generateLedPositions(48, 64) },
	"5:4 Landscape": { "Small": generateLedPositions(10, 8), "Normal": generateLedPositions(20, 16), "Large": generateLedPositions(40, 32), "X Large": generateLedPositions(80, 64) },
	"5:4 Portrait": { "Small": generateLedPositions(8, 10), "Normal": generateLedPositions(16, 20), "Large": generateLedPositions(32, 40), "X Large": generateLedPositions(64, 80) },
	"16:9 Landscape": { "Small": generateLedPositions(32, 18), "Normal": generateLedPositions(48, 27), "Large": generateLedPositions(64, 36), "X Large": generateLedPositions(128, 72) },
	"16:9 Portrait": { "Small": generateLedPositions(18, 32), "Normal": generateLedPositions(27, 48), "Large": generateLedPositions(36, 64), "X Large": generateLedPositions(72, 128) },
	"16:10 Landscape": { "Small": generateLedPositions(32, 20), "Normal": generateLedPositions(48, 30), "Large": generateLedPositions(64, 40), "X Large": generateLedPositions(128, 80) },
	"16:10 Portrait": { "Small": generateLedPositions(29, 32), "Normal": generateLedPositions(30, 48), "Large": generateLedPositions(40, 64), "X Large": generateLedPositions(80, 128) },
	"21:9 Landscape": { "Small": generateLedPositions(42, 18), "Normal": generateLedPositions(63, 27), "Large": generateLedPositions(84, 36), "X Large": generateLedPositions(168, 72) },
	"21:9 Portrait": { "Small": generateLedPositions(18, 42), "Normal": generateLedPositions(27, 63), "Large": generateLedPositions(36, 84), "X Large": generateLedPositions(72, 168) },
	"32:9 Landscape": { "Small": generateLedPositions(64, 18), "Normal": generateLedPositions(96, 27), "Large": generateLedPositions(128, 36), "X Large": generateLedPositions(256, 72) },
	"32:9 Portrait": { "Small": generateLedPositions(18, 64), "Normal": generateLedPositions(27, 96), "Large": generateLedPositions(36, 128), "X Large": generateLedPositions(72, 256) }
};
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
const _vLedNames = {
	"4:1": { "Small": generateLedNames(16), "Normal": generateLedNames(64), "Large": generateLedNames(256), "X Large": generateLedNames(1024) },
	"4:3": { "Small": generateLedNames(48), "Normal": generateLedNames(192), "Large": generateLedNames(768), "X Large": generateLedNames(3072) },
	"5:4": { "Small": generateLedNames(80), "Normal": generateLedNames(320), "Large": generateLedNames(1280), "X Large": generateLedNames(5120) },
	"16:9": { "Small": generateLedNames(576), "Normal": generateLedNames(1296), "Large": generateLedNames(2304), "X Large": generateLedNames(9216) },
	"16:10": { "Small": generateLedNames(640), "Normal": generateLedNames(1440), "Large": generateLedNames(2560), "X Large": generateLedNames(10240) },
	"21:9": { "Small": generateLedNames(756), "Normal": generateLedNames(1701), "Large": generateLedNames(3024), "X Large": generateLedNames(12096) },
	"32:9": { "Small": generateLedNames(1152), "Normal": generateLedNames(2592), "Large": generateLedNames(4608), "X Large": generateLedNames(18432) },
};
const vLedNames = {
	"4:1 Landscape": _vLedNames["4:1"],
	"4:1 Portrait": _vLedNames["4:1"],
	"4:3 Landscape": _vLedNames["4:3"],
	"4:3 Portrait": _vLedNames["4:3"],
	"5:4 Landscape": _vLedNames["5:4"],
	"5:4 Portrait": _vLedNames["5:4"],
	"16:9 Landscape": _vLedNames["16:9"],
	"16:9 Portrait": _vLedNames["16:9"],
	"16:10 Landscape": _vLedNames["16:10"],
	"16:10 Portrait": _vLedNames["16:10"],
	"21:9 Landscape": _vLedNames["21:9"],
	"21:9 Portrait": _vLedNames["21:9"],
	"32:9 Landscape": _vLedNames["32:9"],
	"32:9 Portrait": _vLedNames["32:9"],
};

let __rgbjWallpaperGridPrimed = false;
let __rgbjWallpaperLastMatrixKey = "";

const RGBJ_WALLPAPER_DEFAULT_MATRIX = "16:9 Landscape";
const RGBJ_WALLPAPER_DEFAULT_TIER = "Normal";

function wallpaperTarget() {
	if (typeof controller !== "undefined" && controller && controller.ip) {
		return controller;
	}
	return { name: "Live Wallpaper", ip: "127.0.0.1", port: 8133 };
}

function wallpaperSend(packet) {
	if (typeof udp === "undefined" || !udp || typeof udp.send !== "function") {
		return;
	}
	const target = wallpaperTarget();
	udp.send(target.ip, target.port, packet);
}

function rgbjWallpaperLayoutKeys() {
	const ms =
		typeof MatrixSize !== "undefined" && MatrixSize != null && vLedNames[MatrixSize]
			? MatrixSize
			: RGBJ_WALLPAPER_DEFAULT_MATRIX;
	const mt =
		typeof MatrixTier !== "undefined" && MatrixTier != null && vLedNames[ms] && vLedNames[ms][MatrixTier]
			? MatrixTier
			: RGBJ_WALLPAPER_DEFAULT_TIER;
	return { ms, mt };
}

function rgbjWallpaperLayoutBundle() {
	const { ms, mt } = rgbjWallpaperLayoutKeys();
	const names = vLedNames[ms] && vLedNames[ms][mt];
	const positions = vLedPositions[ms] && vLedPositions[ms][mt];
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
	device.setSize(bundle.size);
	device.setControllableLeds(bundle.names, bundle.positions);
	__rgbjWallpaperGridPrimed = false;
	return true;
}

function syncMatrixLayoutIfNeeded() {
	const key = rgbjWallpaperMatrixKey();
	if (key === __rgbjWallpaperLastMatrixKey) return;
	__rgbjWallpaperLastMatrixKey = key;
	syncMatrixLayout();
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
	device.setFrameRateTarget(fps);
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
	device.setName(wallpaperTarget().name);
	if (typeof device.addFeature === "function") {
		device.addFeature("udp");
	}
	__rgbjWallpaperLastMatrixKey = "";
	syncMatrixLayout();
	const fps = Math.max(1, Math.min(240, Number(FPS) || 60));
	device.setFrameRateTarget(fps);
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

function updateSettings() {
	const gridSize = vLedSizes[MatrixSize] && vLedSizes[MatrixSize][MatrixTier];
	const matrixIdx = vMatrixSize[MatrixSize];
	const tierIdx = vMatrixTier[MatrixTier];
	if (!gridSize || matrixIdx === undefined || tierIdx === undefined) {
		__rgbjWallpaperSettingsResyncOnRender = false;
		try {
			console.warn(
				"[RGBJunkie][Wallpaper] invalid Aspect Ratio / Display Size:",
				MatrixSize,
				MatrixTier
			);
		} catch (_e) { /* ignore */ }
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

	const coverImageBytes = stringToBytes(CoverImage).slice(0, 255);
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
	grabColors(true);
}

function grabColors(shutdown = false) {
	if (!shutdown && !__rgbjWallpaperGridPrimed) {
		__rgbjWallpaperLastSettingsKey = "";
		updateSettings();
		__rgbjWallpaperGridPrimed = true;
	}
	const positions = vLedPositions[MatrixSize] && vLedPositions[MatrixSize][MatrixTier];
	if (!Array.isArray(positions) || positions.length === 0) {
		return;
	}
	const RGBData = [];
	const LedCount = positions.length;
	const NumPackets = Math.ceil(LedCount / MaxLedsInPacket);

	for (let iIdx = 0; iIdx < LedCount; iIdx++) {
		const iPxX = positions[iIdx][0];
		const iPxY = positions[iIdx][1];
		let color;

		if (shutdown) {
			color = hexToRgb(shutdownColor);
		} else if (LightingMode === "Forced") {
			color = hexToRgb(forcedColor);
		} else {
			color = device.color(iPxX, iPxY);
		}

		const iLedIdx = (iIdx) * 3;
		RGBData[iLedIdx] = color[0];
		RGBData[iLedIdx + 1] = color[1];
		RGBData[iLedIdx + 2] = color[2];
	}

	for (let currPacket = 0; currPacket < NumPackets; currPacket++) {
		const startIdx = currPacket * MaxLedsInPacket;
		let packet = [ColorPacket, currPacket, NumPackets];
		packet = packet.concat(RGBData.splice(0, MaxLedsInPacket * 3));
		wallpaperSend(packet);
		void startIdx;
	}
}

function stringToBytes(str) {
	const bytes = [];
	const s = String(str || "");
	for (let i = 0; i < s.length; i++) {
		const code = s.charCodeAt(i);
		if (code < 0x80) {
			bytes.push(code);
		} else if (code < 0x800) {
			bytes.push(0xc0 | (code >> 6));
			bytes.push(0x80 | (code & 0x3f));
		} else if (code < 0xd800 || code >= 0xe000) {
			bytes.push(0xe0 | (code >> 12));
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

		const controllers = [service.getController("Wallpaper"), service.getController("Wallpaper2")];
		controllers.forEach(function (entry) {
			if (!entry) return;
			service.updateController(entry);
			service.announceController(entry);
		});

		updateSettings();
	};

	this.Update = () => {
		for (const cont of service.controllers) {
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

			service.updateController(this);
			service.announceController(this);
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
