/* Original court, characters, scenery and animation for Tideline Club. Three.js r160. */
(function () {
  'use strict';
  window.createArena = function createArena(canvas) {
    const T = window.THREE;
    const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
    renderer.outputColorSpace = T.SRGBColorSpace;
    // Sunlight on the immobile grandstand is rendered once. Animated subjects use
    // soft contact shadows, so their motion never schedules another shadow pass.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    const scene = new T.Scene();
    scene.background = new T.Color(0xffd6af);
    scene.fog = new T.FogExp2(0xffd4ac, 0.0135);
    const camera = new T.PerspectiveCamera(48, 1, 0.12, 180);
    const ambient = new T.HemisphereLight(0xfffaef, 0xaab9bd, 1.83);
    const sun = new T.DirectionalLight(0xffebc8, 1.72);
    sun.position.set(-9, 14, -8);
    sun.castShadow=true;
    Object.assign(sun.shadow.camera,{left:-15,right:15,top:14,bottom:-14,near:.5,far:42});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(1536,1536);
    sun.shadow.normalBias=.026;
    sun.shadow.bias=-.00028;
    scene.add(ambient, sun);

    const solids = new T.MeshLambertMaterial({vertexColors: true, side: T.DoubleSide});
    const unlit = new T.MeshBasicMaterial({vertexColors: true, side: T.DoubleSide});
    const box = new T.BoxGeometry(1,1,1);
    const ball = new T.SphereGeometry(1, 12, 9);
    const faceted = new T.IcosahedronGeometry(1, 0);
    const round = new T.CylinderGeometry(1, 1, 1, 10);
    const objectsToDispose = new Set([solids,unlit,box,ball,faceted,round]);
    const vec = (x, y, z) => new T.Vector3(x, y, z);
    const axisY = vec(0, 1, 0);
    const color = new T.Color(), orientation = new T.Quaternion(), mat4 = new T.Matrix4(), mat3 = new T.Matrix3();
    const point = vec(0, 0, 0), normal = vec(0,0,0), position = vec(0,0,0), scale = vec(1,1,1);
    const euler = new T.Euler();
    let seed = 194106;
    function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    const range = (a,b) => a+(b-a)*random();
    function group(parent) { const g = new T.Group(); parent.add(g); return g; }

    // Bake each articulated part or static scenery layer into a single draw.
    class Batch {
      constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
      add(geo, tint, x, y, z, sx=1, sy=1, sz=1, rx=0, ry=0, rz=0, quaternion) {
        color.set(tint);
        if(quaternion) orientation.copy(quaternion); else orientation.setFromEuler(euler.set(rx, ry, rz));
        mat4.compose(position.set(x,y,z),orientation,scale.set(sx,sy,sz));
        mat3.getNormalMatrix(mat4);
        const p = geo.attributes.position, n = geo.attributes.normal;
        const first = this.p.length / 3;
        for (let j = 0; j < p.count; j++) {
          point.fromBufferAttribute(p,j).applyMatrix4(mat4);
          normal.fromBufferAttribute(n,j).applyMatrix3(mat3).normalize();
          this.p.push(point.x,point.y,point.z); this.n.push(normal.x,normal.y,normal.z);
          this.c.push(color.r,color.g,color.b);
        }
        if (geo.index) { for(const i of geo.index.array) this.i.push(first+i); }
        else { for(let j=0;j<p.count;j++) this.i.push(first+j); }
      }
      cube(c,x,y,z,w,h,d,rx=0,ry=0,rz=0) { this.add(box,c,x,y,z,w,h,d,rx,ry,rz); }
      orb(c,x,y,z,w,h,d) { this.add(ball,c,x,y,z,w,h,d); }
      rod(c,a,b,r,g=round) {
        const direction = vec(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
        const len = direction.length(); if (!len) return;
        const q = new T.Quaternion().setFromUnitVectors(axisY,direction.normalize());
        this.add(g,c,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r,len,r,0,0,0,q);
      }
      tri(c,a,b,d) {
        const n = vec(b[0]-a[0],b[1]-a[1],b[2]-a[2]).cross(vec(d[0]-a[0],d[1]-a[1],d[2]-a[2])).normalize();
        const first = this.p.length/3; color.set(c);
        for(const v of [a,b,d]) { this.p.push(...v); this.c.push(color.r,color.g,color.b); this.n.push(n.x,n.y,n.z); }
        this.i.push(first,first+1,first+2);
      }
      mesh(parent, material=solids) {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(this.p,3));
        geo.setAttribute('normal', new T.Float32BufferAttribute(this.n,3));
        geo.setAttribute('color', new T.Float32BufferAttribute(this.c,3));
        geo.setIndex(this.i);
        geo.computeBoundingSphere();
        const mesh = new T.Mesh(geo,material); parent.add(mesh); objectsToDispose.add(geo); return mesh;
      }
    }
    function track(value) { objectsToDispose.add(value); return value; }
    function shader(source, uniforms={}) {
      return track(new T.ShaderMaterial({
        side: T.DoubleSide, uniforms,
        vertexShader: 'varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: source + '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
      }));
    }
    const dome = track(new T.SphereGeometry(120,32,20));
    const skyMat = shader(`
      varying vec3 vWorld;
      void main(){
        vec3 d=normalize(vWorld-cameraPosition);
        float t=smoothstep(-.012,.182,d.y);
        vec3 sky=mix(vec3(1.,.64,.43),vec3(.26,.66,.72),t);
        sky=mix(sky,vec3(.12,.42,.56),smoothstep(.28,1.,d.y)*.8);
        vec3 s=normalize(vec3(-.42,.057,-1.));
        float dist=length(d-s);
        sky+=vec3(.38,.15,.035)*exp(-9.*dist);
        sky=mix(sky,vec3(1.,.87,.58),1.-smoothstep(.056,.058,dist));
        gl_FragColor=vec4(sky,1.);
    `);
    skyMat.depthWrite=false;
    const sky = new T.Mesh(dome, skyMat); sky.renderOrder=-3; scene.add(sky);
    const oceanGeo=track(new T.PlaneGeometry(190,150));
    const waterMat = shader(`
      varying vec3 vWorld; uniform float uTime;
      void main(){
        float depth=smoothstep(-63.,-.8,vWorld.z);
        vec3 sea=mix(vec3(.41,.72,.72),vec3(.055,.41,.46),depth);
        float p=sin(vWorld.z*5.7+sin(vWorld.x*.4)+uTime*.55);
        float q=sin(vWorld.x*2.1-vWorld.z*.7+uTime*.25);
        float glint=smoothstep(.77,.99,p)*smoothstep(.58,.94,q)*(.35+.65*(1.-depth));
        float sunpath=exp(-.016*abs(vWorld.x-.42*vWorld.z)*abs(vWorld.x-.42*vWorld.z));
        sea=mix(sea,vec3(.95,.82,.59),glint*(.24+.76*sunpath));
        gl_FragColor=vec4(sea,1.);
    `,{uTime:{value:0}});
    const sea = new T.Mesh(oceanGeo,waterMat); sea.rotation.x=-Math.PI/2; sea.position.set(0,-1.65,-24); scene.add(sea);

    const terrain = new Batch(), scenery = new Batch(), sports = new Batch();
    // Distant islands form a low, broken silhouette with a navigable channel between them.
    function island(cx,cz,len,height,palette) {
      const stations=15;
      let last;
      for(let i=0;i<=stations;i++){
        const f=i/stations, crest=Math.pow(Math.max(0,Math.sin(f*Math.PI)),.8);
        const h=crest*(.58+.25*Math.sin(f*10.3)+.22*random())*height;
        const x=cx+(f-.5)*len, bank=cz+crest*3+range(-.35,.35);
        const row=[[x,-1.58,bank+3],[x,-1.4+h*.28,bank+1],[x,-1.55+h,bank-1.3],[x,-1.65+h*.43,bank-4.5]];
        if(last){
          for(let k=0;k<3;k++){
            terrain.tri(palette[k],last[k],row[k],row[k+1]);
            terrain.tri(palette[k],last[k],row[k+1],last[k+1]);
          }
        }
        last=row;
      }
    }
    island(-33,-58,70,7.2,[0xa9b4a6,0x9baa9c,0x94a49a]);
    island(37,-55,60,8.7,[0xadc1ac,0x97ac9f,0x91a59a]);
    island(-31,-35,36,5.4,[0xccb29a,0x789c8d,0x688c83]);
    island(28,-33,34,5.7,[0xc4ac93,0x86a18c,0x6c9083]);
    island(14.7,-19.5,8.4,2.4,[0xd9be97,0xabac85,0x91a786]);
    // Tiny lighthouse and moored sailboats anchor the bay's scale.
    const tower = track(new T.CylinderGeometry(.41,.52,1,10));
    for(let k=0;k<4;k++) scenery.add(tower,k%2?0xe47b60:0xffe3b4,14.4,.7+k*.65,-20.7,.86,.66,.86);
    scenery.add(round,0x435f5a,14.4,3.13,-20.7,.48,.15,.48);
    scenery.add(round,0xffd68e,14.4,3.40,-20.7,.30,.44,.30);
    const cone=track(new T.ConeGeometry(1,1,9));
    scenery.add(cone,0xd96552,14.4,3.78,-20.7,.52,.53,.52);
    function boat(x,z,size,accent) {
      const y=-1.60;
      scenery.orb(0xefddc0,x,y,z,1.04*size,.18*size,.29*size);
      scenery.rod(0x9a806b,[x,y,z],[x,y+2.65*size,z],.027*size);
      scenery.tri(accent,[x-.055*size,y+2.50*size,z],[x-.055*size,y+.37*size,z],[x-1.08*size,y+.34*size,z]);
      scenery.tri(0xfff2cf,[x+.06*size,y+1.94*size,z],[x+.74*size,y+.40*size,z],[x+.06*size,y+.35*size,z]);
    }
    boat(-10.6,-21.8,.92,0xe68b6d); boat(4.1,-29,.68,0xefc990); boat(-2.6,-42,.60,0xbac3af);
    // Folded, wind-shaped cypresses and a pale surf line across the distant headland.
    for(const s of [-1,1]) {
      for(let t=0;t<27;t++){
        const x=s*range(18,36), z=range(-37,-32.5);
        const h=range(.68,2.05), y=.86+.35*Math.sin(x*.43);
        scenery.add(cone,t%3?0x6a9a85:0x81a38b,x,y+h*.5,z,h*.19,h,h*.22,0,0,s*range(.01,.12));
      }
      for(let t=0;t<9;t++){
        const x=s*range(19,36), z=range(-29.6,-27.1);
        scenery.cube(0xe0dfbc,x,-1.57,z,range(.65,2.4),.023,.08);
      }
    }
    // Slender distant clouds and birds, leaving a clear backdrop behind the net.
    for (const c of [[-26,5,-44,7],[5,8,-54,6],[28,7.0,-53,5],[-5,4,-59,4]]) {
      for (let i=0;i<4;i++) scenery.orb(0xffdfbc,c[0]+i*c[3]*.58,c[1]+range(-.16,.18),c[2],c[3]*(.46+random()*.24),.16+random()*.17,1.15);
    }
    for(let b=0;b<6;b++){
      const x=range(-14,-5),y=range(3.6,5.4),z=range(-34,-24);
      scenery.tri(0x6d8880,[x-.28,y+.07,z],[x-.06,y+.02,z],[x,y-.06,z]);
      scenery.tri(0x6d8880,[x,y-.06,z],[x+.10,y+.08,z],[x+.28,y+.11,z]);
    }

    // A sun-faded deck on stone piers under a regulation-marked court.
    terrain.cube(0xbf9774,0,-.50,0,21.2,.76,19.4);
    terrain.cube(0xe6be8e,0,-.13,0,21.3,.17,19.5);
    for(let x=-9.9;x<10.3;x+=1.12) terrain.cube(0xd9af82,x,-.041,0,.018,.009,19.45);
    terrain.cube(0x207d7d,0,-.042,0,8.65,.09,15.83);
    const courtColors=[0x328f88,0x36958b];
    for(let n=0;n<10;n++) sports.cube(courtColors[n%2],0,.009,-6.7+.67+n*1.34,6.1,.014,1.34);
    // Official service, singles and doubles markings. Net covers the central seam.
    const white=0xf6edcd;
    for(const x of [-3.05,-2.59,2.59,3.05]) sports.cube(white,x,.024,0,.044,.012,13.45);
    for(const z of [-6.70,-5.94,-1.98,1.98,5.94,6.70]) sports.cube(white,0,.024,z,6.13,.012,.044);
    for(const z of [-4.34,4.34]) sports.cube(white,0,.024,z,.044,.012,4.72);
    for(const x of [-3.68,3.68]) {
      for(const z of [-7.24,7.24]) {
        sports.cube(0xf3c98c,x,.026,z,.55,.02,.05);
        sports.cube(0xf3c98c,x+Math.sign(x)*.25,.026,z-Math.sign(z)*.22,.05,.02,.48);
      }
    }
    const backdrop = 0x2f7771;
    for(const side of [-1,1]){
      const x=side*5.26;
      for (const z of [-4.8,0,4.8]) {
        scenery.cube(backdrop,x,.35,z,.075,.69,4.66);
        scenery.cube(0xf6d299,x,.71,z,.10,.045,4.68);
        scenery.cube(0xe3af71,x-side*.041,.15,z,.015,.036,4.50);
      }
      // Open-sided grandstand, emulating painted boards and timber bleachers.
      for(let step=0;step<3;step++) {
        const benchX=side*(6.17+step*.84), level=.30+step*.36;
        scenery.cube(0x977956,benchX,level/2-.02,-.95,.79,level,8.7);
        scenery.cube(0xe5bc85,benchX,level,-.95,.89,.095,8.85);
        scenery.cube(0xcd9871,benchX-side*.43,level-.03,-.95,.04,.072,8.85);
      }
    }
    // Low rear balustrade, interrupted by an opening for the waterfront steps.
    for(const s of [-1,1]){
      scenery.cube(0xa07d61,s*6.48,.40,-9.34,7.5,.10,.12);
      scenery.cube(0x7b8066,s*6.48,.18,-9.34,7.5,.04,.09);
      for(let j=0;j<5;j++) scenery.cube(0x967456,s*(2.85+j*1.77),.22,-9.34,.10,.54,.11);
    }
    // Seated spectators, each baked in the scenery layer.
    const clothes=[0xcd6555,0x337f80,0xf3d295,0xe39261,0x587f8c,0xd0a378,0xe1c1a0,0x498e8a];
    const skins=[0xb98361,0xe4af82,0xd19a75,0xf0be93,0x986a52], hair=[0x574438,0x414b44,0x71533f];
    for(const s of [-1,1]) for(let row=0;row<3;row++) {
      for(let j=0;j<7;j++) {
        if(random()<.33) continue;
        const x=s*(6.12+row*.84), z=-4.85+j*1.27+range(-.13,.13), level=.34+row*.36;
        const skin=skins[Math.floor(random()*skins.length)], shirt=clothes[Math.floor(random()*clothes.length)];
        scenery.orb(shirt,x,level+.27,z,.19,.27,.23);
        scenery.orb(skin,x-.035*s,level+.65,z,.159,.174,.158);
        scenery.orb(hair[Math.floor(random()*hair.length)],x-.01*s,level+.74,z,.166,.12,.167);
        if((row+j)%4===0){
          scenery.orb(0xe7c596,x-s*.055,level+.765,z,.183,.071,.178);
          scenery.orb(0xe7c596,x-s*.155,level+.735,z,.136,.025,.157);
        }
        scenery.orb(skin,x-s*.184,level+.64,z,.039,.038,.040);
        for(const k of [-1,1]){
          scenery.rod(skin,[x-s*.08,level+.39,z+k*.18],[x-s*.26,level+.16,z+k*.12],.055);
          scenery.rod(0x556b65,[x,level+.07,z+k*.11],[x-s*.33,level+.05,z+k*.11],.082);
          scenery.rod(skin,[x-s*.33,level+.04,z+k*.11],[x-s*.48,level-.18,z+k*.11],.047);
          scenery.orb(0xf3dbad,x-s*.50,level-.18,z+k*.11,.097,.049,.060);
        }
      }
    }

    function parasol(x,z,y,r,palette){
      scenery.rod(0xad8357,[x,-.04,z],[x,y+.13,z],.052);
      const top=[x,y+.48,z], sectors=12;
      const rim=(rad,k,height)=>[x+Math.cos(k*2*Math.PI/sectors)*rad,height,z+Math.sin(k*2*Math.PI/sectors)*rad];
      for(let j=0;j<sectors;j++){
        const tint=palette[j%2], a=rim(r*.63,j,y+.29),b=rim(r*.63,j+1,y+.29);
        const c=rim(r,j,y),d=rim(r,j+1,y);
        scenery.tri(tint,top,b,a); scenery.tri(tint,a,b,c); scenery.tri(tint,c,b,d);
        scenery.tri(tint,c,d,rim(r*.97,j+.5,y-.12));
      }
      scenery.orb(0xfbe0aa,x,y+.49,z,.075,.075,.075);
    }
    parasol(-8.25,-4.50,2.82,2.1,[0xe3785e,0xffdfad]);
    parasol(8.25,-2.7,2.82,2.0,[0x599990,0xffdfa9]);
    parasol(-8.6,1.5,2.85,1.65,[0xf5ce8b,0xe38c61]);
    parasol(7.95,-7.4,2.18,1.55,[0xe78869,0xf4d6ab]);
    function palm(x,z,h,lean){
      const base=[x,-.10,z],joint=[x+lean*.27,h*.44,z],tip=[x+lean,h,z+.13];
      scenery.rod(0x9e805e,base,joint,.16); scenery.rod(0x97795c,joint,tip,.13);
      for(let j=0;j<9;j++) {
        const a=j*Math.PI*2/9+range(-.22,.22), length=h*range(.47,.70), yaw=range(-.25,.25);
        const dx=Math.cos(a),dz=Math.sin(a);
        const mid = f => [tip[0]+dx*f*length-dz*yaw*f*f, tip[1]+length*(.95*f-1.04*f*f), tip[2]+dz*f*length+dx*yaw*f*f];
        const tint=[0x30695c,0x428572,0x3e785f][j%3];
        for(let k=0;k<8;k++){
          const f=k/8,n=(k+1)/8,p=mid(f),next=mid(n);
          const spread=Math.sin((f+.07)*Math.PI)*length*.132;
          for(const side of [-1,1]){
            const edge=[next[0]-dz*side*spread+dx*.12,next[1]-spread*.43,next[2]+dx*side*spread+dz*.12];
            scenery.tri(tint,p,next,edge);
            const root=[p[0]-dz*side*spread*.40,p[1]-spread*.10,p[2]+dx*side*spread*.40];
            scenery.tri(tint,p,edge,root);
          }
        }
      }
    }
    palm(-8.1,-8.15,5.4,1.02); palm(-10.4,-6.7,4.8,-.65);
    palm(8.2,-8.45,5.4,-.68); palm(10.2,-5.7,4.6,.52);
    palm(-10.3,3.1,5.5,.6); palm(10.25,3.4,5.6,-.52);
    // Succulents cluster around the ends of the stands, as on a coastal promenade.
    function planter(x,z,wide){
      scenery.cube(0xb57355,x,.21,z,.70,.48,wide);
      scenery.cube(0xeab085,x,.43,z,.76,.09,wide+.09);
      scenery.cube(0x716a4d,x,.48,z,.61,.025,wide-.07);
      for(let i=0;i<Math.ceil(wide*4);i++){
        const baseX=x+range(-.14,.14), baseZ=z+range(-wide*.41,wide*.41);
        const height=range(.39,.69);
        for(let k=0;k<7;k++){
          const a=k*.90+random()*.35, size=range(.27,.50), dx=Math.cos(a),dz=Math.sin(a);
          const base=[baseX,.46,baseZ], apex=[baseX+dx*size,.49+height,baseZ+dz*size];
          const middle=[baseX+dx*size*.58,.49+height*.75,baseZ+dz*size*.58];
          const left=[middle[0]-dz*.067,middle[1]-.023,middle[2]+dx*.067];
          const right=[middle[0]+dz*.067,middle[1]-.023,middle[2]-dx*.067];
          const tint=k%2?0x46826d:0x76a180;
          scenery.tri(tint,base,middle,left);scenery.tri(tint,left,middle,apex);
          scenery.tri(0x528576,base,right,middle);scenery.tri(0x528576,right,apex,middle);
        }
      }
    }
    for(const s of [-1,1]){
      planter(5.98*s,4.6,1.16);
      planter(5.87*s,-6.40,1.13);
      planter(8.82*s,-7.77,1.62);
    }
    // Venue pennants, with original diagonal stripe and split tails.
    for(const s of [-1,1]) {
      const x=s*4.24, z=-8.5;
      scenery.rod(0x977d62,[x,0,z],[x,3.50,z],.040);
      const u=s*.87;
      scenery.tri(0xeb795a,[x,3.43,z],[x+u,3.34,z+.05],[x,2.92,z]);
      scenery.tri(0xffdfad,[x+u*.31,3.40,z+.022],[x+u*.44,3.39,z+.029],[x+u*.22,3.04,z+.015]);
    }

    // Net cords use one line draw, with tape and posts in the court mesh.
    const cords=[];
    const cord=(a,b)=>cords.push(...a,...b);
    for(let x=-3.04;x<=3.06;x+=.112) cord([x,.80,0],[x,1.53+.023*Math.abs(x)/3.05,0]);
    for(let y=.80;y<=1.54;y+=.096) {
      cord([-3.05,y+.020,0],[0,y,0]); cord([0,y,0],[3.05,y+.020,0]);
    }
    const cordGeo=track(new T.BufferGeometry()); cordGeo.setAttribute('position', new T.Float32BufferAttribute(cords,3));
    const cordMat=track(new T.LineBasicMaterial({color:0x193e46,transparent:true,opacity:.65,depthWrite:false}));
    scene.add(new T.LineSegments(cordGeo,cordMat));
    for(const s of [-1,1]) {
      sports.add(round,0x245d5b,s*3.1,.789,0,.045,1.57,.045);
      sports.add(round,0xfcdfaa,s*3.1,1.56,0,.060,.09,.060);
      sports.rod(white,[0,1.528,0],[s*3.10,1.554,0],.025);
      sports.cube(0xeb855c,s*3.10,.055,0,.34,.09,.42);
    }
    const paint=track(solids.clone());
    paint.onBeforeCompile=program=>{
      program.vertexShader='varying vec3 courtLocal;\n'+program.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncourtLocal=position;');
      program.fragmentShader='varying vec3 courtLocal;\n'+program.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 grainCell=floor(courtLocal.xz*95.);
        float grain=fract(sin(dot(grainCell,vec2(41.53,26.79)))*1453.45)-.5;
        float distanceFade=1.-smoothstep(5.,18.,distance(cameraPosition,courtLocal));
        diffuseColor.rgb*=1.+grain*.12*distanceFade;
      `);
    };
    const floorMesh=terrain.mesh(scene), setMesh=scenery.mesh(scene), sportsMesh=sports.mesh(scene,paint);
    floorMesh.receiveShadow=setMesh.receiveShadow=sportsMesh.receiveShadow=true;
    setMesh.castShadow=sportsMesh.castShadow=true;

    function canvasTexture(w,h,draw) {
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      draw(c.getContext('2d'));
      const texture=track(new T.CanvasTexture(c)); texture.colorSpace=T.SRGBColorSpace; return texture;
    }
    const placard=canvasTexture(768,128,ctx=>{
      ctx.fillStyle='#216764'; ctx.fillRect(0,0,768,128); ctx.fillStyle='#fff0ce';
      ctx.font='800 65px Arial, sans-serif'; ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('TIDELINE CLUB',402,65);
      for(let j=0;j<3;j++){
        const x=45+j*16;ctx.beginPath();ctx.moveTo(x,88);ctx.lineTo(x+17,42);ctx.lineTo(x+25,42);ctx.lineTo(x+8,88);ctx.fill();
      }
    });
    const signGeo=track(new T.PlaneGeometry(2.90,.485)), signMat=track(new T.MeshBasicMaterial({map:placard}));
    for(const side of [-1,1]){
      for(const z of [-4.8,3.1]){
        const sign=new T.Mesh(signGeo,signMat); sign.position.set(side*5.21,.40,z); sign.rotation.y=-side*Math.PI/2;scene.add(sign);
      }
    }
    const shadowTexture=canvasTexture(96,96,ctx=>{
      const grad=ctx.createRadialGradient(48,48,1,48,48,47);
      grad.addColorStop(0,'rgba(15,46,50,.70)');grad.addColorStop(.42,'rgba(17,53,52,.39)');grad.addColorStop(1,'rgba(17,52,50,0)');
      ctx.fillStyle=grad;ctx.fillRect(0,0,96,96);
    });
    const shadowGeometry=track(new T.PlaneGeometry(1,1));
    function shadow(opacity){
      const m=track(new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity,polygonOffset:true,polygonOffsetFactor:-1}));
      const blob=new T.Mesh(shadowGeometry,m);blob.rotation.x=-Math.PI/2;blob.renderOrder=1;scene.add(blob);return blob;
    }
    function softBodyPart(batch,c,a,b,rad) {
      batch.rod(c,a,b,rad);
      batch.orb(c,...a,rad,rad,rad);
      batch.orb(c,...b,rad,rad,rad);
    }
    // Tailor the shirt with rings rather than scaled blocks, including shoulders and waist.
    function jersey(b,shirt,trim){
      const rings=[[-.10,.214,.157],[.04,.229,.165],[.26,.292,.179],[.34,.20,.141]];
      for(let j=0;j<rings.length-1;j++) for(let i=0;i<12;i++){
        const rp=(r,k)=>[Math.cos(k*Math.PI/6)*r[1],r[0],Math.sin(k*Math.PI/6)*r[2]];
        const a=rp(rings[j],i),cc=rp(rings[j],i+1),d=rp(rings[j+1],i),e=rp(rings[j+1],i+1);
        const tint=(i===0||i===5)&&j!==2?trim:shirt;
        b.tri(tint,a,d,cc); b.tri(tint,cc,d,e);
      }
    }
    const hoop=track(new T.TorusGeometry(.168,.015,7,32)), collar=track(new T.TorusGeometry(.12,.021,6,20));
    function racket(parent,frame){
      const b=new Batch(); b.rod(0x374f51,[0,-.05,0],[0,.135,0],.037);
      b.rod(0xe6d7a3,[0,.13,0],[0,.405,0],.014);
      b.add(hoop,frame,0,.57,0,1,1.20,1);
      for(let j=-3;j<=3;j++){
        const k=j*.042, h=Math.sqrt(Math.max(0,.155*.155-k*k));
        b.rod(0xe3e3cb,[k,.57-h*1.22,0],[k,.57+h*1.22,0],.0039);
        b.rod(0xebdfba,[-h,.57+k*1.22,0],[h,.57+k*1.22,0],.0039);
      }
      return b.mesh(parent);
    }
    function athlete(near) {
      const actor=group(scene), pelvis=group(actor), spine=group(pelvis), neck=group(spine);
      const shirt=near?0xe36c4e:0x335f76, accent=near?0xffda91:0x70c5b7, shorts=near?0x285c61:0x315466;
      const skin=near?0xc68c67:0xe0ae82, dark=near?0x493b34:0x514639;
      const shadowBlob=shadow(.85);
      pelvis.position.y=.84;spine.position.y=.10;
      let b=new Batch();
      b.orb(shorts,0,-.035,0,.236,.157,.154);
      b.cube(0xe6c7a5,0,.055,0,.44,.044,.28);
      b.mesh(pelvis);
      b=new Batch();
      jersey(b,shirt,accent);
      b.add(collar,accent,0,.34,0,1,1,1,Math.PI/2);
      b.rod(skin,[0,.315,0],[0,.432,0],.097);
      b.cube(accent,-.11,.221,-.157,.075,.036,.012,0,0,-.23);
      // Paired back jersey bars remain readable from the player camera.
      b.cube(accent,-.052,.167,.169,.043,.128,.017,0,0,-.06);
      b.cube(accent,.041,.167,.169,.043,.128,.017,0,0,-.06);
      b.mesh(spine);
      neck.position.y=.49;
      b=new Batch();b.orb(skin,0,.075,-.015,.242,.252,.219);
      for(const k of [-1,1]) {
        b.orb(skin,k*.234,.075,-.008,.048,.070,.045);
        b.orb(0x403d36,k*.081,.105,-.217,.018,.024,.012);
        b.cube(dark,k*.084,.151,-.210,.059,.013,.013,0,0,k*.09);
      }
      b.orb(skin,0,.059,-.228,.035,.038,.026);
      b.orb(dark,0,.205,.014,.249,.161,.226);
      b.orb(dark,0,.119,.146,.225,.196,.10);
      for(let i=0;i<4;i++) b.orb(dark,-.137+i*.082,.195,-.142,.086,.080,.069);
      const band=near?0xffdc91:0xece6ce;
      b.add(round,band,0,.178,-.002,.247,.047,.223);
      if(near) {
        b.orb(dark,.015,.082,.26,.108,.104,.127);
        b.orb(shirt,.014,.135,.213,.081,.044,.07);
      } else {
        b.orb(0xece5c9,.012,.254,.005,.244,.111,.218);
        b.orb(0xf5eacd,.015,.187,-.194,.217,.024,.147);
      }
      b.mesh(neck);
      const legs=[],arms=[];
      for(const side of [-1,1]){
        const hip=group(pelvis),knee=group(hip);hip.position.set(side*.132,-.087,0);
        knee.position.set(0,-.292,-.026);
        b=new Batch();softBodyPart(b,skin,[0,-.03,0],[0,-.293,-.026],.085);
        b.add(round,shorts,0,-.082,0,.115,.20,.112);b.mesh(hip);
        b=new Batch();softBodyPart(b,skin,[0,0,0],[0,-.245,.031],.070);
        b.add(round,0xf6ebd3,0,-.213,.029,.073,.17,.073);
        b.add(round,accent,0,-.145,.026,.076,.025,.076);
        b.orb(0xf4e6c9,0,-.352,-.040,.097,.073,.165);
        b.cube(shorts,0,-.390,-.046,.172,.046,.26);
        b.cube(shirt,side*.087,-.349,-.057,.014,.020,.113,0,0,.18);
        b.mesh(knee);legs.push({hip,knee,side});
        const shoulder=group(spine),elbow=group(shoulder),hand=group(elbow);
        shoulder.position.set(side*.249,.259,-.003);
        const prox=[side*.076,-.249,-.015],dist=[side*.032,-.127,-.167];
        elbow.position.set(...prox);hand.position.set(...dist);
        b=new Batch();softBodyPart(b,skin,[0,0,0],prox,.070);
        b.orb(shirt,side*.025,-.025,.000,.109,.11,.105);
        b.rod(shirt,[0,0,0],[side*.045,-.105,-.006],.089);b.mesh(shoulder);
        b=new Batch();softBodyPart(b,skin,[0,0,0],dist,.063);
        b.orb(near?0xffdc91:0x5eb3a5,side*.027,-.103,-.13,.068,.068,.064);
        b.orb(skin,...dist,.066,.070,.065); b.mesh(elbow);
        if(side===1){ hand.rotation.z=-.66;hand.rotation.x=-.24;racket(hand,near?0xffbe62:0x83e0d2); }
        arms.push({shoulder,elbow,hand,side});
      }
      return {actor,pelvis,spine,neck,legs,arms,shadow:shadowBlob,near,lastX:null,step:0,motion:0};
    }
    const player=athlete(true), opponent=athlete(false);
    function animatePerson(a,x,z,swing,clock,dt,ready) {
      const near=a.near;
      const speed=a.lastX===null?0:Math.max(-5,Math.min(5,(x-a.lastX)/Math.max(dt,.001)));
      a.lastX=x; a.motion+=(Math.abs(speed)/5-a.motion)*(1-Math.exp(-dt*12));
      a.step+=dt*(3.0+a.motion*13);
      const bob=.006*Math.sin(clock*3.6)+Math.abs(Math.sin(a.step))*.033*a.motion;
      const amount=Math.min(1,Math.max(0,swing||0));
      const drive=Math.sin(amount*Math.PI), reach=amount*(.78+.22*Math.sin(amount*Math.PI));
      a.actor.position.set(x,bob,z);
      a.actor.rotation.y=(near?0:Math.PI)+(near?-1:1)*(.09+.05*speed)+.62*drive;
      a.pelvis.position.y=.789-.021*(ready?1:0)+.04*drive;
      a.spine.rotation.x=.075+.085*a.motion-.13*reach;
      a.spine.rotation.z=(near?1:-1)*speed*.023+.17*drive;
      a.neck.rotation.y=-.26*drive; a.neck.rotation.x=-.12+.09*Math.sin(clock*2.5);
      for(const limb of a.legs) {
        const walk=Math.sin(a.step)*limb.side*a.motion;
        limb.hip.rotation.x=.05+.43*walk+.13*drive*limb.side;
        limb.hip.rotation.z=limb.side*.12-.035*speed;
        limb.knee.rotation.x=-.08-.35*Math.max(0,walk)-.09*(ready?1:0);
      }
      const left=a.arms[0],right=a.arms[1];
      left.shoulder.rotation.x=.14-.37*Math.sin(a.step)*a.motion+.75*drive;
      left.shoulder.rotation.z=-.20-.39*drive;
      right.shoulder.rotation.x=.44+.12*Math.sin(clock*3.3)+1.67*reach+.44*drive;
      right.shoulder.rotation.z=.23+.93*reach-.80*drive;
      right.elbow.rotation.x=.31+.47*reach-.30*drive;
      right.hand.rotation.z=-.66+.87*drive-.39*reach;
      right.hand.rotation.y=-.34+.95*drive;
      a.shadow.position.set(x+.060,.042,z+.036);a.shadow.scale.set(1.18, .74, 1);
    }

    const shuttle=group(scene);const shuttleBatch=new Batch();
    shuttleBatch.orb(0xffedaf,0,-.083,0,.069,.081,.069);
    shuttleBatch.add(round,0x4c7770,0,-.038,0,.073,.046,.073);
    const wings=12;
    for(let i=0;i<wings;i++){
      const a=i*Math.PI*2/wings, cos=Math.cos(a),sin=Math.sin(a);
      const v=(r,h,l)=>[r*cos-l*sin,h,r*sin+l*cos];
      const base=v(.055,-.027,0),stem=v(.101,.112,-.009),end=v(.135,.184,.004),lf=v(.139,.173,-.033),rt=v(.136,.168,.038);
      const featherColor=i%3===0?0xfcf1ce:0xfff7e5;
      shuttleBatch.tri(featherColor,base,lf,stem);shuttleBatch.tri(featherColor,base,stem,rt);
      shuttleBatch.tri(featherColor,stem,lf,end);shuttleBatch.tri(featherColor,stem,end,rt);
    }
    shuttleBatch.mesh(shuttle,unlit);
    const glowTexture=canvasTexture(96,96,ctx=>{
      let g=ctx.createRadialGradient(48,48,1,48,48,48);
      g.addColorStop(0,'rgba(255,245,177,.90)');g.addColorStop(.19,'rgba(255,223,138,.68)');
      g.addColorStop(.51,'rgba(255,203,109,.24)');g.addColorStop(1,'rgba(255,217,143,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,96,96);
    });
    const glowMaterial=track(new T.SpriteMaterial({map:glowTexture,transparent:true,opacity:.69,depthWrite:false}));
    const glow=new T.Sprite(glowMaterial);glow.scale.set(.68,.68,1);scene.add(glow);
    const ballShadow=shadow(.80);
    const landRing=new T.Mesh(track(new T.RingGeometry(.25,.28,48)),track(new T.MeshBasicMaterial({color:0xffdf8a,transparent:true,opacity:.82,depthWrite:false,side:T.DoubleSide})));
    landRing.rotation.x=-Math.PI/2;scene.add(landRing);
    // Velocity-aligned quads taper into a single ribbon over the most recent 150 ms.
    const trailLength=15,trailPositions=new Float32Array(trailLength*2*3);
    const path=[],trailGeo=track(new T.BufferGeometry()),indices=[],trailColors=[];
    for(let i=0;i<trailLength;i++){
      const c=new T.Color(0xffe8af).lerp(new T.Color(0xe9a76b),i/(trailLength-1));trailColors.push(c.r,c.g,c.b,c.r,c.g,c.b);
      if(i<trailLength-1)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
    }
    const trailAttr=new T.BufferAttribute(trailPositions,3).setUsage(T.DynamicDrawUsage);
    trailGeo.setAttribute('position',trailAttr);trailGeo.setAttribute('color',new T.Float32BufferAttribute(trailColors,3));trailGeo.setIndex(indices);
    const trailMat=track(new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.67,depthWrite:false}));
    const ribbon=new T.Mesh(trailGeo,trailMat);ribbon.frustumCulled=false;scene.add(ribbon);
    const pulseGroup=group(scene),pulseBatch=new Batch();
    for(let j=0;j<10;j++){
      const a=j*2*Math.PI/10;
      const v=(radius,w)=>[radius*Math.cos(a)-w*Math.sin(a),radius*Math.sin(a)+w*Math.cos(a),0];
      pulseBatch.tri(j%2?0xfff4d3:0xffc078,v(.25,-.018),v(.61,0),v(.25,.018));
    }
    const pulseMaterial=track(new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,depthWrite:false}));
    pulseBatch.mesh(pulseGroup,pulseMaterial);
    const up=vec(0,1,0), velocity=vec(0,0,0), prevBall=vec(0,0,0), targetRot=new T.Quaternion();
    const fromCamera=vec(0,0,0),sideVector=vec(0,0,0),direction=vec(0,0,0);
    let prevValid=false,lastHit=0,pulseAge=1,lastPhase='',time=0,viewW=0,viewH=0;

    function resize(){
      const w=Math.max(1,canvas.clientWidth||canvas.width),h=Math.max(1,canvas.clientHeight||canvas.height);
      if(w===viewW&&h===viewH)return;viewW=w;viewH=h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65,Math.sqrt(2450000/(w*h))));
      renderer.setSize(w,h,false);
      const aspect=w/h, narrow=Math.max(0,1.25-aspect);
      camera.aspect=aspect;camera.fov=48+narrow*8;
      camera.position.set(.46*(1-.7*narrow),5.53+narrow*1.55,13.23+narrow*5.90+Math.max(0,.62-aspect)*8.8);
      camera.lookAt(0,1.18+narrow*.16,-.86);camera.updateProjectionMatrix();
    }
    function updateShuttle(state,dt,clock) {
      const active=Boolean(state.ball)&&state.phase!=='over'&&state.phase!=='point';
      shuttle.visible=glow.visible=ballShadow.visible=active;
      landRing.visible=active&&Boolean(state.ready);
      if(!active){ribbon.visible=false;path.length=0;prevValid=false;return;}
      const p=state.ball;
      shuttle.position.set(p.x,p.y,p.z);glow.position.copy(shuttle.position);
      let flight=state.phase==='flight';
      if(prevValid) velocity.subVectors(shuttle.position,prevBall);
      if(!flight||!prevValid||lastPhase!==state.phase||velocity.lengthSq()>5.5)path.length=0;
      if(flight&&prevValid&&velocity.lengthSq()>.000002){
        targetRot.setFromUnitVectors(up,direction.copy(velocity).normalize().negate());
        shuttle.quaternion.slerp(targetRot,1-Math.exp(-dt*38));
      }else if(!flight) shuttle.rotation.set(-.34,0,-.18);
      shuttle.scale.setScalar(1.21);
      ballShadow.position.set(p.x+.025*p.y,.040,p.z+.023*p.y);ballShadow.scale.setScalar(.35+.045*p.y);
      ballShadow.material.opacity=.84/(1+.13*Math.max(0,p.y));
      if(landRing.visible){
        landRing.position.set(p.x,.046,p.z);landRing.scale.setScalar(.99+.10*Math.sin(clock*17));
      }
      if(flight){
        if(!path.length||clock-path[0].at>=.009) path.unshift({x:p.x,y:p.y,z:p.z,at:clock});
        while(path.length>trailLength||path.length>1&&clock-path[path.length-1].at>.155)path.pop();
      }
      ribbon.visible=flight&&path.length>=2;
      if(ribbon.visible){
        for(let i=0;i<path.length;i++){
          const a=i===0?p:path[i],b=path[i+1]||path[i-1];
          direction.set(a.x-b.x,a.y-b.y,a.z-b.z);if(i===path.length-1)direction.negate();
          fromCamera.set(camera.position.x-a.x,camera.position.y-a.y,camera.position.z-a.z);
          sideVector.crossVectors(direction,fromCamera).normalize().multiplyScalar(.058*(1-i/(path.length-1)));
          trailAttr.setXYZ(i*2,a.x+sideVector.x,a.y+sideVector.y,a.z+sideVector.z);
          trailAttr.setXYZ(i*2+1,a.x-sideVector.x,a.y-sideVector.y,a.z-sideVector.z);
        }
        trailAttr.needsUpdate=true;trailGeo.setDrawRange(0,(path.length-1)*6);
      }
      prevBall.copy(shuttle.position);prevValid=true;
    }
    function render(state, delta){
      const dt=Number.isFinite(delta)?Math.max(.001,Math.min(.06,delta)):.0167;
      time+=dt;
      resize();waterMat.uniforms.uTime.value=time;
      animatePerson(player,state.playerX??0,state.playerZ??4.85,state.playerSwing,time,dt,state.ready && (state.phase==="serve" ? state.server===0 : state.flight?.side===1));
      animatePerson(opponent,state.aiX??0,state.aiZ??-4.85,state.aiSwing,time+.65,dt,state.duel && state.ready && (state.phase==="serve" ? state.server===1 : state.flight?.side===0));
      updateShuttle(state,dt,time);
      const hit=Number(state.hit)||0;
      if(hit>lastHit+.08&&state.ball){pulseAge=0;pulseGroup.position.copy(shuttle.position);}
      pulseAge+=dt;pulseGroup.visible=pulseAge<.21;
      if(pulseGroup.visible){
        pulseGroup.quaternion.copy(camera.quaternion);pulseGroup.scale.setScalar(.52+pulseAge*3.75);pulseMaterial.opacity=Math.max(0,1-pulseAge/.21);
      }
      lastHit=hit;lastPhase=state.phase;
      renderer.render(scene,camera);
    }
    function dispose(){for(const item of objectsToDispose)item.dispose();sun.shadow.dispose();renderer.dispose();}
    resize();
    return {render,resize,dispose};
  };
})();
