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

package com.watabou.noosa;

import com.badlogic.gdx.Gdx;
import com.watabou.glscripts.Script;
import com.watabou.glwrap.Attribute;
import com.watabou.glwrap.Quad;
import com.watabou.glwrap.Uniform;
import com.watabou.glwrap.Vertexbuffer;
import com.watabou.utils.DeviceCompat;

import java.nio.Buffer;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;

public class NoosaScript extends Script {
	
	public Uniform uCamera;
	public Uniform uModel;
	public Uniform uTex;
	public Uniform uColorM;
	public Uniform uColorA;
	public Attribute aXY;
	public Attribute aUV;
	
	private Camera lastCamera;
	//P10(web): scratch ELEMENT_ARRAY_BUFFER for client-side index arrays (see drawElements)
	private static int webScratchIndexBuffer = 0;
	
	public NoosaScript() {

		super();
		compile( shader() );
		
		uCamera	= uniform( "uCamera" );
		uModel	= uniform( "uModel" );
		uTex	= uniform( "uTex" );
		uColorM	= uniform( "uColorM" );
		uColorA	= uniform( "uColorA" );
		aXY		= attribute( "aXYZW" );
		aUV		= attribute( "aUV" );

		Quad.setupIndices();
		Quad.bindIndices();
		
	}
	
	@Override
	public void use() {
		
		super.use();
		
		aXY.enable();
		aUV.enable();
		
	}

	public void drawElements( FloatBuffer vertices, ShortBuffer indices, int size ) {

		((Buffer)vertices).position( 0 );
		aXY.vertexPointer( 2, 4, vertices );

		((Buffer)vertices).position( 2 );
		aUV.vertexPointer( 2, 4, vertices );

		//P10(web): WebGL (GLES2) cannot read client-side index arrays either. The original
		// path releases Quad's index VBO and calls glDrawElements with a client ShortBuffer,
		// which the gdx-teavm backend turns into gl.drawElements against an unbound
		// ELEMENT_ARRAY_BUFFER, generating GL errors on every draw (Chromium eventually
		// reports "WebGL: too many errors"). On web we upload the caller's indices into a
		// scratch ELEMENT_ARRAY_BUFFER and draw with a byte-offset instead.
		// Desktop/Android keep the original path.
		if (DeviceCompat.isWeb()) {
			if (webScratchIndexBuffer == 0) {
				webScratchIndexBuffer = Gdx.gl20.glGenBuffer();
			}
			Gdx.gl20.glBindBuffer( Gdx.gl20.GL_ELEMENT_ARRAY_BUFFER, webScratchIndexBuffer );
			Gdx.gl20.glBufferData( Gdx.gl20.GL_ELEMENT_ARRAY_BUFFER, indices.remaining() * 2, indices, Gdx.gl20.GL_DYNAMIC_DRAW );
			Gdx.gl20.glDrawElements( Gdx.gl20.GL_TRIANGLES, size, Gdx.gl20.GL_UNSIGNED_SHORT, 0 );
			Quad.bindIndices();
			return;
		}

		Quad.releaseIndices();
		Gdx.gl20.glDrawElements( Gdx.gl20.GL_TRIANGLES, size, Gdx.gl20.GL_UNSIGNED_SHORT, indices );
		Quad.bindIndices();
	}

	public void drawTriangles( Vertexbuffer buffer, int size ) {
		if (size == 0) {
			return;
		}

		buffer.updateGLData();
		buffer.bind();

		aXY.vertexBuffer( 2, 4, 0 );
		aUV.vertexBuffer( 2, 4, 2 );

		buffer.release();

		Gdx.gl20.glDrawArrays( Gdx.gl20.GL_TRIANGLES, 0, size );
	}

	public void drawQuad( FloatBuffer vertices ) {

		((Buffer)vertices).position( 0 );
		aXY.vertexPointer( 2, 4, vertices );

		((Buffer)vertices).position( 2 );
		aUV.vertexPointer( 2, 4, vertices );
		
		Gdx.gl20.glDrawElements( Gdx.gl20.GL_TRIANGLES, Quad.SIZE, Gdx.gl20.GL_UNSIGNED_SHORT, 0 );
	}

	public void drawQuad( Vertexbuffer buffer ) {

		buffer.updateGLData();

		buffer.bind();

		aXY.vertexBuffer( 2, 4, 0 );
		aUV.vertexBuffer( 2, 4, 2 );

		buffer.release();
		
		Gdx.gl20.glDrawElements( Gdx.gl20.GL_TRIANGLES, Quad.SIZE, Gdx.gl20.GL_UNSIGNED_SHORT, 0 );
	}
	
	public void drawQuadSet( FloatBuffer vertices, int size ) {
		
		if (size == 0) {
			return;
		}

		((Buffer)vertices).position( 0 );
		aXY.vertexPointer( 2, 4, vertices );

		((Buffer)vertices).position( 2 );
		aUV.vertexPointer( 2, 4, vertices );
		
		Gdx.gl20.glDrawElements( Gdx.gl20.GL_TRIANGLES, Quad.SIZE * size, Gdx.gl20.GL_UNSIGNED_SHORT, 0 );
	}

	public void drawQuadSet( Vertexbuffer buffer, int length, int offset ){

		if (length == 0) {
			return;
		}

		buffer.updateGLData();

		buffer.bind();

		aXY.vertexBuffer( 2, 4, 0 );
		aUV.vertexBuffer( 2, 4, 2 );

		buffer.release();
		
		Gdx.gl20.glDrawElements( Gdx.gl20.GL_TRIANGLES, Quad.SIZE * length, Gdx.gl20.GL_UNSIGNED_SHORT, Quad.SIZE * Short.SIZE/8 * offset );
	}
	
	public void lighting( float rm, float gm, float bm, float am, float ra, float ga, float ba, float aa ) {
		uColorM.value4f( rm, gm, bm, am );
		uColorA.value4f( ra, ga, ba, aa );
	}
	
	public void resetCamera() {
		lastCamera = null;
	}
	
	public void camera( Camera camera ) {
		if (camera == null) {
			camera = Camera.main;
		}
		if (camera != lastCamera && camera.matrix != null) {
			lastCamera = camera;
			uCamera.valueM4( camera.matrix );

			if (!camera.fullScreen) {
				Gdx.gl20.glEnable( Gdx.gl20.GL_SCISSOR_TEST );

				//This fixes pixel scaling issues on some hidpi displays (mainly on macOS)
				// because for some reason all other openGL operations work on virtual pixels
				// but glScissor operations work on real pixels
				float xScale = DeviceCompat.getRealPixelScaleX();
				float yScale = DeviceCompat.getRealPixelScaleY();

				Gdx.gl20.glScissor(
						Math.round(camera.x * xScale),
						Math.round((Game.height - camera.screenHeight - camera.y) * yScale),
						Math.round(camera.screenWidth * xScale),
						Math.round(camera.screenHeight * yScale));
			} else {
				Gdx.gl20.glDisable( Gdx.gl20.GL_SCISSOR_TEST );
			}
		}
	}
	
	public static NoosaScript get() {
		return Script.use( NoosaScript.class );
	}
	
	
	protected String shader() {
		return SHADER;
	}
	
	private static final String SHADER =
		
		//vertex shader
		"uniform mat4 uCamera;\n" +
		"uniform mat4 uModel;\n" +
		"attribute vec4 aXYZW;\n" +
		"attribute vec2 aUV;\n" +
		"varying vec2 vUV;\n" +
		"void main() {\n" +
		"  gl_Position = uCamera * uModel * aXYZW;\n" +
		"  vUV = aUV;\n" +
		"}\n" +
		
		//this symbol separates the vertex and fragment shaders (see Script.compile)
		"//\n" +
		
		//fragment shader
		//preprocessor directives let us define precision on GLES platforms, and ignore it elsewhere
		"#ifdef GL_ES\n" +
		"  precision mediump float;\n" +
		"#endif\n" +
		"varying vec2 vUV;\n" +
		"uniform sampler2D uTex;\n" +
		"uniform vec4 uColorM;\n" +
		"uniform vec4 uColorA;\n" +
		"void main() {\n" +
		"  gl_FragColor = texture2D( uTex, vUV ) * uColorM + uColorA;\n" +
		"}\n";
}
