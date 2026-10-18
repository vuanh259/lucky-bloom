const ids=new Set(["candy-bouquet","candy-pack","hairtie","keychain","lemon-tea","mini-comb","mini-hairclip","mini-lego","mini-mirror","mini-notebook","one-lollipop","phone-case","single-flower","snack-bag","snack-pack","tea","three-lollipops"]);
export const giftImages=new Map();
export function giftArtUrl(gift){return ids.has(gift.id)?new URL('./gift-art/'+gift.id+'.svg?v=20261018-art',import.meta.url).href:null;}
export function setGiftArt(element,gift){element.replaceChildren();const url=giftArtUrl(gift);if(!url){element.textContent=gift.emoji;return;}const image=document.createElement('img');image.src=url;image.alt='';image.className='gift-illustration';image.decoding='async';element.append(image);}
export async function preloadGiftArt(gifts){await Promise.all(gifts.map(gift=>new Promise(resolve=>{const url=giftArtUrl(gift);if(!url)return resolve();const image=new Image();image.onload=()=>{giftImages.set(gift.id,image);resolve();};image.onerror=()=>resolve();image.src=url;})));}

