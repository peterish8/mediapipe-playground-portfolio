const canvas = document.createElement("canvas");
canvas.className = "ambient-shader";
canvas.setAttribute("aria-hidden", "true");
document.body.prepend(canvas);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const pointer = { x: 0.5, y: 0.45, targetX: 0.5, targetY: 0.45 };
const gl = canvas.getContext("webgl", {
  alpha: true,
  antialias: false,
  powerPreference: "low-power",
});

if (gl) {
  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision lowp float;
    uniform vec2 u_resolution;
    uniform vec2 u_pointer;
    uniform float u_time;

    float blob(vec2 point, vec2 center, float radius) {
      return 1.0 - smoothstep(radius * 0.08, radius, distance(point, center));
    }

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      vec2 point = vec2(uv.x * aspect, uv.y);
      vec2 cursor = vec2(u_pointer.x * aspect, u_pointer.y);
      float time = u_time * 0.08;

      vec3 color = vec3(0.012, 0.018, 0.028);
      vec2 mintCenter = vec2(aspect * 0.16 + sin(time * 1.2) * 0.10, 0.18 + cos(time) * 0.08);
      vec2 blueCenter = vec2(aspect * 0.86 + cos(time * 0.8) * 0.12, 0.48 + sin(time * 1.1) * 0.12);
      vec2 coralCenter = vec2(aspect * 0.48 + sin(time * 0.65) * 0.18, 0.90 + cos(time * 0.7) * 0.06);

      color += vec3(0.00, 0.30, 0.24) * blob(point, mintCenter, 0.72);
      color += vec3(0.04, 0.12, 0.44) * blob(point, blueCenter, 0.84);
      color += vec3(0.32, 0.07, 0.18) * blob(point, coralCenter, 0.70);
      color += vec3(0.09, 0.20, 0.30) * blob(point, cursor, 0.62);

      float vignette = smoothstep(1.18, 0.18, distance(uv, vec2(0.5)));
      float grain = hash(gl_FragCoord.xy + u_time) - 0.5;
      color *= 0.62 + vignette * 0.42;
      color += grain * 0.012;
      gl_FragColor = vec4(color, 0.80);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = vertexShader && fragmentShader ? gl.createProgram() : null;

  if (program && vertexShader && fragmentShader) {
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
  }

  if (!program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.remove();
  } else {
    const buffer = gl.createBuffer();
    const position = gl.getAttribLocation(program, "a_position");
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const pointerUniform = gl.getUniformLocation(program, "u_pointer");
    const time = gl.getUniformLocation(program, "u_time");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (now) => {
      pointer.x += (pointer.targetX - pointer.x) * 0.045;
      pointer.y += (pointer.targetY - pointer.y) * 0.045;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointerUniform, pointer.x, 1 - pointer.y);
      gl.uniform1f(time, now);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", (event) => {
      pointer.targetX = event.clientX / window.innerWidth;
      pointer.targetY = event.clientY / window.innerHeight;
    }, { passive: true });

    if (reducedMotion.matches) {
      draw(0);
    } else {
      const start = performance.now();
      const render = (now) => {
        draw((now - start) / 1000);
        requestAnimationFrame(render);
      };
      requestAnimationFrame(render);
    }
  }
}
