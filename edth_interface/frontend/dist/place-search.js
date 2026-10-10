const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro');
const kinds = {capital:'Capitală',state_capital:'Reședință de județ',city:'Oraș',town:'Oraș',village:'Sat',hamlet:'Cătun',suburb:'Cartier',quarter:'Cartier',neighbourhood:'Cartier'};

/** Offline locality search; no geocoding service or monitoring data. */
export function setupPlaceSearch(onSelect) {
  const input = document.getElementById('place-search');
  const list = document.getElementById('place-results');
  let places = [], results = [], active = -1, loadFailed = false;
  const close = () => { list.hidden=true; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); active=-1; };
  function select(index) {
    const place=results[index]; if(!place) return;
    input.value=place.name; close(); onSelect(place);
  }
  function highlight(index) {
    active=index;
    Array.from(list.children).forEach((el,i)=>el.setAttribute('aria-selected',String(i===index)));
    if(index>=0){ input.setAttribute('aria-activedescendant',`place-option-${index}`); list.children[index]?.scrollIntoView({block:'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  }
  function show() {
    const query=fold(input.value.trim());
    if(query.length<2){close();return;}
    results=places.filter(p=>p.key.includes(query)).sort((a,b)=>Number(b.key.startsWith(query))-Number(a.key.startsWith(query)) || (a.rank-b.rank) || a.name.localeCompare(b.name,'ro')).slice(0,8);
    list.replaceChildren(); active=-1;
    if(!results.length){
      const empty=document.createElement('div'); empty.className='place-empty'; empty.textContent=loadFailed?'Catalogul local nu poate fi încărcat.':'Nicio localitate găsită. Încearcă alt nume.'; list.append(empty);
    }
    results.forEach((place,index)=>{
      const button=document.createElement('button');button.type='button';button.id=`place-option-${index}`;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;
      const name=document.createElement('strong');name.textContent=place.name;
      const detail=document.createElement('small');detail.textContent=`${kinds[place.kind]||'Localitate'} · ${place.lat.toFixed(3)}° N, ${place.lon.toFixed(3)}° E`;
      button.append(name,detail);button.addEventListener('click',()=>select(index));list.append(button);
    });
    list.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',show);input.addEventListener('focus',show);
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){close();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(list.hidden)show();if(!results.length)return;
      highlight((active+(event.key==='ArrowDown'?1:-1)+results.length)%results.length);
    } else if(event.key==='Enter'&&!list.hidden&&results.length){event.preventDefault();select(active>=0?active:0);}
    else if(event.key==='Tab')close();
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.place-search'))close();});
  const shortcuts={
    'București':{name:'București',lon:26.1025,lat:44.4268,height:1600},
    'Cluj-Napoca':{name:'Cluj-Napoca',lon:23.5899,lat:46.7704,height:1800},
    'Brașov':{name:'Brașov',lon:25.5887,lat:45.6427,height:2000},
  };
  document.querySelectorAll('[data-place]').forEach(button=>button.addEventListener('click',()=>{
    const place=shortcuts[button.dataset.place];if(place){input.value=place.name;close();onSelect(place);}
  }));
  fetch('./maps/romania/cities.json',{mode:'same-origin',credentials:'same-origin',redirect:'error'})
    .then(response=>{if(!response.ok)throw new Error('Catalog unavailable');return response.json();})
    .then(data=>{
      if(!Array.isArray(data))throw new Error('Invalid locality catalog');
      places=data.filter(p=>typeof p.name==='string'&&Number.isFinite(p.lon)&&Number.isFinite(p.lat)).map(p=>({...p,key:fold(p.name),rank:['capital','state_capital','city'].includes(p.kind)?0:p.kind==='town'?1:2}));
      input.title=`${places.length.toLocaleString('ro-RO')} localități în catalogul local`;
      if(document.activeElement===input)show();
    }).catch(()=>{loadFailed=true;input.title='Catalogul local nu poate fi încărcat';if(document.activeElement===input)show();});
  return { clear(){input.value='';close();} };
}
