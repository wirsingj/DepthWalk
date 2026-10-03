import * as THREE from 'three';

// Demo adapter only. Any engine can instead supply scalar view-Z or device
// depth to DepthWalkFilter. B/A contain no material IDs, colors or normals.
export function createDepthMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{preview:{value:false},depthRange:{value:22}},
    vertexShader:`varying float distanceZ;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.0);distanceZ=-p.z;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`precision highp float; varying float distanceZ;
      uniform bool preview; uniform float depthRange;
      void main(){float z=exp(-max(distanceZ,0.0)/depthRange);
        if(preview){gl_FragColor=vec4(vec3(z),1.0);}
        else{float q=floor(z*65535.0+0.5);
          gl_FragColor=vec4(floor(q/256.0)/255.0,mod(q,256.0)/255.0,0.0,1.0);}}`,
    toneMapped:false,
  });
}
