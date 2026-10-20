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

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.GamesInProgress;
import com.shatteredpixel.shatteredpixeldungeon.SPDSettings;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.noosa.Game;
import com.watabou.utils.Bundle;
import com.watabou.utils.FileUtils;
import com.watabou.utils.PlatformSupport;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Browser lifecycle adjustments which should not change native game behavior.
 */
public class WebShatteredPixelDungeon extends ShatteredPixelDungeon {

	private static final long AUTO_SAVE_INTERVAL_MS = 3_000;

	private long nextAutoSaveAt;

	public WebShatteredPixelDungeon(PlatformSupport platform) {
		super(platform);
	}

	@Override
	public void create() {
		// A tab can be reloaded before the first-run tutorial is completed. The
		// normal intro flow always opens a new slot, so recover the existing run.
		if (SPDSettings.intro() && hasSavedGame()) {
			SPDSettings.intro(false);
		}

		super.create();
		reflectionSelfTest();
		filesystemSelfTest();
	}

	@Override
	public void render() {
		super.render();

		// Browser storage writes issued during pagehide may be cancelled. Save
		// stable turns periodically so refreshing loses at most a few seconds.
		if (Game.realTime >= nextAutoSaveAt
				&& Game.scene() instanceof GameScene
				&& Dungeon.hero != null
				&& Dungeon.hero.ready) {
			nextAutoSaveAt = Game.realTime + AUTO_SAVE_INTERVAL_MS;
			try {
				Dungeon.saveAll();
			} catch (IOException e) {
				reportException(e);
			}
		}
	}

	private boolean hasSavedGame() {
		for (int slot = 1; slot <= GamesInProgress.MAX_SLOTS; slot++) {
			if (FileUtils.fileLength("game" + slot + "/game.dat") > 1) {
				return true;
			}
		}
		return false;
	}

	private void reflectionSelfTest() {
		try {
			LevelTransition original = new LevelTransition();
			original.centerCell = 42;
			original.type = LevelTransition.Type.SURFACE;

			Bundle bundle = new Bundle();
			bundle.put("probe", original);

			ByteArrayOutputStream bytes = new ByteArrayOutputStream();
			Bundle.write(bundle, bytes, false);
			Bundle restored = Bundle.read(new ByteArrayInputStream(bytes.toByteArray()));
			LevelTransition roundTripped = (LevelTransition) restored.get("probe");

			if (roundTripped == null || roundTripped.centerCell != original.centerCell) {
				throw new RuntimeException("web reflection self-test round-trip failed");
			}
		} catch (Exception e) {
			reportException(e);
		}
	}

	private void filesystemSelfTest() {
		try {
			String dirName = "web-self-test/";
			if (FileUtils.dirExists(dirName)) {
				FileUtils.deleteDir(dirName);
			}

			FileUtils.getFileHandle(dirName + "probe.dat").writeString("probe", false);
			if (!FileUtils.getFileHandle(dirName + "probe.dat").readString().equals("probe")) {
				throw new RuntimeException("web filesystem self-test write/read failed");
			}

			FileUtils.getFileHandle(dirName + "probe.dat.spdtmp").writeString("moved", false);
			FileUtils.getFileHandle(dirName + "probe.dat.spdtmp").moveTo(
					FileUtils.getFileHandle(dirName + "probe.dat"));
			if (!FileUtils.getFileHandle(dirName + "probe.dat").readString().equals("moved")) {
				throw new RuntimeException("web filesystem self-test moveTo failed");
			}
			if (FileUtils.filesInDir(dirName).isEmpty()) {
				throw new RuntimeException("web filesystem self-test list failed");
			}
			if (!FileUtils.deleteDir(dirName)) {
				throw new RuntimeException("web filesystem self-test deleteDirectory failed");
			}
		} catch (Exception e) {
			reportException(e);
		}
	}
}
