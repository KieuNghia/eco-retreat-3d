const fs=require('fs'),vm=require('vm');const s={window:{}};vm.createContext(s);vm.runInContext(fs.readFileSync('outputs/eco-retreat-v2/model.js','utf8'),s);const d=s.window.makeApartment();
const rect=(x,z,w,h)=>({x1:x-w/2,x2:x+w/2,z1:z-h/2,z2:z+h/2});
const walls=d.walls.filter(w=>w.kind==='wall').map(w=>{let t=w.thickness||d.wallThickness;return rect((w.x1+w.x2)/2,(w.z1+w.z2)/2,Math.abs(w.x2-w.x1)+t,Math.abs(w.z2-w.z1)+t)});
let issues=[];for(const f of d.furniture){if(['rug','plant'].includes(f.type))continue;let c=Math.abs(Math.cos(f.rotation||0)),s=Math.abs(Math.sin(f.rotation||0)),r=rect(f.x,f.z,c*f.w+s*f.d,s*f.w+c*f.d);for(const w of walls){let x=Math.min(w.x2,r.x2)-Math.max(w.x1,r.x1),z=Math.min(w.z2,r.z2)-Math.max(w.z1,r.z1);if(x>.015&&z>.015)issues.push({type:f.type,x:f.x,z:f.z,overlap:[+x.toFixed(3),+z.toFixed(3)]})}}
console.log(JSON.stringify({wallFurnitureOverlaps:issues},null,2));
if(issues.length)process.exitCode=1;
