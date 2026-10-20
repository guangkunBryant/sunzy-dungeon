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

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.g2d.PixmapPacker;
import com.badlogic.gdx.graphics.g2d.freetype.FreeTypeFontGenerator;
import com.watabou.utils.PlatformSupport;

import java.util.ArrayList;
import java.util.HashMap;

public class WebPlatformSupport extends PlatformSupport {

	private static FreeTypeFontGenerator basicFontGenerator;
	private static FreeTypeFontGenerator asianFontGenerator;

	@Override
	public void updateDisplaySize() {
		// Browser canvas sizing is owned by WebApplicationConfiguration.
	}

	@Override
	public boolean supportsFullScreen() {
		return false;
	}

	@Override
	public void updateSystemUI() {
		// Browser chrome and fullscreen prompts cannot be controlled like native UI.
	}

	@Override
	public boolean connectedToUnmeteredNetwork() {
		return true;
	}

	@Override
	public boolean supportsVibration() {
		return Gdx.input.isPeripheralAvailable(com.badlogic.gdx.Input.Peripheral.Vibrator);
	}

	@Override
	public void setupFontGenerators(int pageSize, boolean systemFont) {
		if (fonts != null && this.pageSize == pageSize && this.systemfont == systemFont) {
			return;
		}

		this.pageSize = pageSize;
		this.systemfont = systemFont;

		resetGenerators(false);
		fonts = new HashMap<>();

		if (systemFont) {
			basicFontGenerator = asianFontGenerator = new FreeTypeFontGenerator(Gdx.files.internal("fonts/droid_sans.ttf"));
		} else {
			basicFontGenerator = new FreeTypeFontGenerator(Gdx.files.internal("fonts/pixel_font.ttf"));
			asianFontGenerator = new FreeTypeFontGenerator(Gdx.files.internal("fonts/droid_sans.ttf"));
		}

		fonts.put(basicFontGenerator, new HashMap<>());
		fonts.put(asianFontGenerator, new HashMap<>());
		packer = new PixmapPacker(pageSize, pageSize, Pixmap.Format.RGBA8888, 1, false);
	}

	@Override
	protected FreeTypeFontGenerator getGeneratorForString(String input) {
		for (int i = 0; i < input.length(); i++) {
			if (isAsianChar(input.charAt(i))) {
				return asianFontGenerator;
			}
		}
		return basicFontGenerator;
	}

	@Override
	public String[] splitforTextBlock(String text, boolean multiline) {
		ArrayList<String> pieces = new ArrayList<>();
		StringBuilder current = new StringBuilder();

		for (int i = 0; i < text.length(); i++) {
			char ch = text.charAt(i);
			boolean doubleAsterisk = ch == '*' && i + 1 < text.length() && text.charAt(i + 1) == '*';
			boolean boundary = ch == '\n' || ch == '_' || isAsianChar(ch) || (multiline && ch == ' ');

			if (doubleAsterisk) {
				flushTextPiece(current, pieces);
				pieces.add("**");
				i++;
			} else if (boundary) {
				flushTextPiece(current, pieces);
				pieces.add(String.valueOf(ch));
			} else {
				current.append(ch);
			}
		}
		flushTextPiece(current, pieces);

		return pieces.toArray(new String[0]);
	}

	private static void flushTextPiece(StringBuilder current, ArrayList<String> pieces) {
		if (current.length() > 0) {
			pieces.add(current.toString());
			current.setLength(0);
		}
	}

	private static boolean isAsianChar(char ch) {
		return (ch >= 0xAC00 && ch <= 0xD7AF)
				|| (ch >= 0x4E00 && ch <= 0x9FFF)
				|| (ch >= 0x3000 && ch <= 0x303F)
				|| (ch >= 0xFF00 && ch <= 0xFFEF)
				|| (ch >= 0x3040 && ch <= 0x309F)
				|| (ch >= 0x30A0 && ch <= 0x30FF);
	}
}
