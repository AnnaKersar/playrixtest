export function loadRoundImages(urls,createImage=()=>new Image(),timeoutMs=20000){
 return Promise.all(urls.map(url=>new Promise((resolve,reject)=>{
  const img=createImage(),timer=setTimeout(()=>reject(Error('Image load timed out')),timeoutMs);
  img.onload=async()=>{try{await img.decode();clearTimeout(timer);resolve(img);}catch(e){clearTimeout(timer);reject(e);}};
  img.onerror=()=>{clearTimeout(timer);reject(Error('Image load failed'));};
  img.src=url;
 })));
}
