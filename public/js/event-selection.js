// Estado local del selector. No realiza escrituras hasta el guardado general.
export function createSelection(rows, existing, companyId){
 const catalog=new Map(rows.filter(s=>s.can_reserve||s.company_id!==companyId).map(s=>[s.id,s]));
 const locked=new Set(existing.filter(l=>!['draft','rejected','released'].includes(l.state)).map(l=>l.item_id));
 const initial=new Map(existing.filter(l=>l.state==='draft'&&catalog.has(l.item_id)&&catalog.get(l.item_id).can_reserve).map(l=>[l.item_id,l]));
 // Los borradores cuyo permiso cambió se mantienen intactos y no son editables aquí.
 for(const l of existing)if(l.state==='draft'&&!initial.has(l.item_id))locked.add(l.item_id);
 const selected=new Map([...initial].map(([id,l])=>[id,{quantity:l.requested,unit_ids:[...(l.selected_units||[])],explicit:!!l.selected_units?.length}]));
 function toggle(id,checked){if(!catalog.has(id)||locked.has(id))return;if(checked&&!selected.has(id)){const l=initial.get(id);selected.set(id,l?{quantity:l.requested,unit_ids:[...(l.selected_units||[])],explicit:!!l.selected_units?.length}:{quantity:1,unit_ids:[],explicit:false});}else if(!checked)selected.delete(id);}
 function quantity(v){return v.explicit?v.unit_ids.length:Number(v.quantity);}
 function deficit(id,v){const s=catalog.get(id);const available=v.explicit?v.unit_ids.filter(uid=>s.units.some(u=>u.id===uid)).length:s.available;return Math.max(0,(quantity(v)||0)-available);}
 function payload(){const lines=[],remove_ids=[];for(const [id,v] of selected){const n=quantity(v);if(!Number.isSafeInteger(n)||n<1||n>5000)throw new Error(`Cantidad entre 1 y 5000: ${catalog.get(id).name}`);const units=v.explicit?[...v.unit_ids]:[],l=initial.get(id);if(l&&l.requested===n&&JSON.stringify([...units].sort((a,b)=>a-b))===JSON.stringify([...(l.selected_units||[])].sort((a,b)=>a-b)))continue;lines.push({item_id:id,quantity:n,unit_ids:units,request:!catalog.get(id).can_reserve});}for(const [id,l] of initial)if(!selected.has(id))remove_ids.push(l.id);return {lines,remove_ids};}
 return {catalog,locked,selected,toggle,quantity,deficit,payload};
}
