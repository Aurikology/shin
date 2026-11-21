import { writeFileSync } from 'node:fs';
const cats = [
  ['dairy','milks',22],['dairy','cheeses',18],['dairy','yogurts',14],['dairy','butters',6],['bread','breads',16],
  ['snacks','chips-and-fries',12],['snacks','chocolates',10],['snacks','biscuits-and-cakes',10],['drinks','sodas',12],['drinks','juices',10],['drinks','waters',6],
  ['frozen','frozen-foods',14],['pantry','pastas',8],['pantry','breakfast-cereals',10],['pantry','canned-foods',10],['pantry','sauces',8],['pantry','peanut-butters',4],
  ['produce','fruits-and-vegetables-based-foods',8],['household','household-cleaning',4],['household','toothpastes',3],['household','shampoos',3],['household','dishwashing',2]
];
const out=[]; const seen=new Set();
for (const [group,tag,n] of cats) {
  const u=`https://world.openfoodfacts.org/api/v2/search?countries_tags_en=canada&categories_tags_en=${tag}&sort_by=unique_scans_n&page_size=${n*3}&fields=code,product_name,brands,quantity,unique_scans_n`;
  try {
    let r; for (let a=0;a<5;a++){ r=await fetch(u,{headers:{"user-agent":"grocery-barcode-sampler/1.0"}}); if(r.ok)break; await new Promise(z=>setTimeout(z,12000)); }
    if(!r.ok){console.error(tag,r.status);await new Promise(r=>setTimeout(r,15000));continue}
    const j=await r.json(); let k=0;
    for(const p of j.products??[]){
      if(k>=n)break; const c=String(p.code||''); if(!/^[0-9]{8,14}$/.test(c)||seen.has(c)||!p.product_name)continue;
      seen.add(c); k++; out.push({group,tag,code:c,name:p.product_name,brand:p.brands||'',qty:p.quantity||'',scans:p.unique_scans_n||0});
    }
    console.error(tag,k);
  } catch(e){ console.error(tag,'ERR',String(e)); }
  await new Promise(r=>setTimeout(r,7000));
}
writeFileSync(new URL('barcodes.json',import.meta.url),JSON.stringify(out,null,1)); console.error('total',out.length);
