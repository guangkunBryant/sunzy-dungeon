/*
 * Pixel Dungeon
 * Copyright (C) 2012-2015 Oleg Dolya
 *
 * Shattered Pixel Dungeon
 * Copyright (C) 2014-2026 Evan Debenham
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

package com.shatteredpixel.shatteredpixeldungeon.web;

import com.badlogic.gdx.Files;
import com.github.xpenatan.gdx.teavm.backends.web.WebApplication;
import com.github.xpenatan.gdx.teavm.backends.web.WebApplicationConfiguration;
import com.watabou.noosa.Game;
import com.watabou.utils.FileUtils;

public class WebLauncher {

	public static void main(String[] args) {
		Game.version = "4.0.2-WEB";
		Game.versionCode = 911;

		FileUtils.setDefaultFileProperties(Files.FileType.Local, "shattered-pixel-dungeon/");
		FileUtils.setBundleCompression(false);

		WebApplicationConfiguration config = new WebApplicationConfiguration("canvas");
		config.width = 0;
		config.height = 0;
		config.storagePrefix = "shattered-pixel-dungeon";
		config.showDownloadLogs = true;
		config.preloadListener = assetLoader -> assetLoader.loadScript("freetype.js");

		new WebApplication(new WebShatteredPixelDungeon(new WebPlatformSupport()), config);
	}
}
