// Bounded read-only inspection of the exact qualified JSPI adapter.
import { loadJspiBrowserAdapter } from "./lib/jspi-browser-adapter.mjs";
const adapter=await loadJspiBrowserAdapter(process.cwd()),lines=adapter.recipe.generated.split(/\r?\n/);
const pattern=new RegExp(process.argv[2]??"1786904|1918992|1919056|1919120|ALLOCATOR_ROOT|ALIGNED_SLOT|POOL_SLOT|qualifiedBinarySha|nativeEnvelope");
const selected=new Set();
for(let index=0;index<lines.length;index++)if(pattern.test(lines[index]))for(let other=Math.max(0,index-1);other<=Math.min(lines.length-1,index+1);other++)selected.add(other);
console.log([...selected].slice(0,90).map(index=>`${index+1}: ${lines[index].length>1800?`[omitted ${lines[index].length}-character line]`:lines[index]}`).join("\n"));
