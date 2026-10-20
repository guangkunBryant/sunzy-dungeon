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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

package com.watabou.glwrap;

import com.badlogic.gdx.Gdx;
import com.watabou.utils.DeviceCompat;

import java.nio.Buffer;
import java.nio.FloatBuffer;

public class Attribute {

	private int location;
	//P10(web): WebGL (GLES2) cannot read client-side vertex arrays, so the FloatBuffer
	// overload of glVertexAttribPointer is unimplemented in the gdx-teavm backend and
	// throws GdxRuntimeException. This broke rendering of any visual that draws through
	// NoosaScript.drawElements/drawQuad(FloatBuffer) (e.g. effects.Flare, effects.CircleArc
	// in the HUD, visible immediately after restoring a save). On web we instead upload the
	// client buffer into a scratch VBO and use the buffer-offset glVertexAttribPointer
	// overload, which the backend does implement. Desktop/Android keep the original path.
	private static int webScratchBuffer = 0;

	public Attribute( int location ) {
		this.location = location;
	}
	
	public int location() {
		return location;
	}
	
	public void enable() {
		Gdx.gl.glEnableVertexAttribArray( location );
	}
	
	public void disable() {
		Gdx.gl.glDisableVertexAttribArray( location );
	}
	
	public void vertexPointer( int size, int stride, FloatBuffer ptr ) {
		if (DeviceCompat.isWeb()) {
			if (webScratchBuffer == 0) {
				webScratchBuffer = Gdx.gl20.glGenBuffer();
			}
			int offsetFloats = ((Buffer)ptr).position();
			((Buffer)ptr).position(0);
			Gdx.gl20.glBindBuffer( Gdx.gl20.GL_ARRAY_BUFFER, webScratchBuffer );
			Gdx.gl20.glBufferData( Gdx.gl20.GL_ARRAY_BUFFER, ptr.remaining() * 4, ptr, Gdx.gl20.GL_DYNAMIC_DRAW );
			Gdx.gl20.glVertexAttribPointer( location, size, Gdx.gl.GL_FLOAT, false, stride * 4, offsetFloats * 4 );
			return;
		}
		Gdx.gl.glVertexAttribPointer( location, size, Gdx.gl.GL_FLOAT, false, stride * 4, ptr );
	}

	public void vertexBuffer( int size, int stride, int offset) {
		Gdx.gl.glVertexAttribPointer(location, size, Gdx.gl.GL_FLOAT, false, stride * 4, offset * 4);
	}
}
