export const SURFACE = Object.freeze({ SKY:0, ROAD:1, PAVING:2, CONCRETE:3, BRICK:4, METAL:5, GLASS:6, LEAVES:7, BARK:8, SIGNAL:9 });
export const SURFACE_COUNT = 10;
// World-anchored, time-independent detail shared by the normal and depth passes.
export const surfaceGLSL = `
float surfaceHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float grout(vec2 p, float width) {
  vec2 d=min(fract(p),1.0-fract(p));
  vec2 aa=max(fwidth(p),vec2(0.001));
  vec2 edge=smoothstep(vec2(width)-aa,vec2(width)+aa,d);
  return min(edge.x,edge.y);
}
float surfaceDetail(vec3 p, vec3 n, float kind) {
  vec2 face=abs(n.y)>0.6?p.xz:(abs(n.x)>0.6?p.zy:p.xy);
  if(kind<1.5) return 0.73+0.24*surfaceHash(floor(p.xz*32.0));
  if(kind<2.5) return mix(0.45,0.86+0.13*surfaceHash(floor(p.xz/1.1)),grout(p.xz/1.1,0.035));
  if(kind<3.5) return mix(0.64,0.9+0.08*surfaceHash(floor(face*8.0)),grout(face/vec2(2.3,3.3),0.018));
  if(kind<4.5) {
    vec2 brick=face/vec2(0.95,0.42);brick.x+=mod(floor(brick.y),2.0)*0.5;
    return mix(0.54,0.75+0.25*surfaceHash(floor(brick)),grout(brick,0.045));
  }
  if(kind<5.5) return 0.7+0.28*smoothstep(0.07,0.18,fract(face.x*2.4));
  if(kind<6.5) return mix(0.2,0.7+0.3*surfaceHash(floor(face/vec2(1.4,0.7))),grout(face/vec2(1.4,0.7),0.045));
  if(kind<7.5) return 0.62+0.38*surfaceHash(floor(p.xz*5.0)+floor(p.y*6.0));
  if(kind<8.5) return 0.65+0.3*surfaceHash(vec2(floor((p.x+p.z)*22.0),floor(p.y*1.5)));
  return 0.86+0.14*step(0.2,fract(p.y*3.0));
}`;
