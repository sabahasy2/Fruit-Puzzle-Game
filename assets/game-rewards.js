(()=>{"use strict";
const $=id=>document.getElementById(id);
let lastProfile=null;
async function refreshGameRewards(){
  const badge=$("redPointsBalance");
  try{
    const response=await fetch("/api/rewards/profile",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"تعذر تحميل الرصيد");
    lastProfile=data;
    if(badge)badge.textContent=Number(data.points||0).toLocaleString("ar-IQ");
    return data;
  }catch{
    if(badge)badge.textContent="—";
    return null;
  }
}
function show(content){
  $("modalContent").innerHTML=content;
  $("modalLayer").classList.remove("hidden");
}
async function openWallet(){
  const profile=await refreshGameRewards();
  if(!profile){
    $("accountBtn").click();
    return;
  }
  const linked=profile.linked===true;
  show('<div class="modal-hero">❤️</div><div class="eyebrow">نقاط متجر آدم النور</div><h2>رصيدك الأحمر</h2><div style="font-size:34px;font-weight:900;color:#bd173c;margin:12px 0">❤️ '+Number(profile.points||0).toLocaleString("ar-IQ")+'</div>'+
    (linked?'<p>حساب اللعبة مرتبط بحساب المتجر. أكمل كل 10 مراحل لتحصل على 200 نقطة حمراء.</p>':
    '<p>أنشئ رمز الربط من لوحة «نقاطي ومكافآتي» في المتجر، ثم ألصقه هنا. الرمز صالح لخمس دقائق ويُستخدم مرة واحدة.</p><a href="https://adam-al-noor-books.pages.dev/?gameLink=1" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;margin:10px 0;color:#9d1d3a;font-weight:800">افتح المتجر لإنشاء رمز الربط ↗</a><input class="field" id="storeGameLinkCode" inputmode="text" autocomplete="one-time-code" maxlength="48" placeholder="رمز الربط المكوّن من 48 خانة" style="direction:ltr;text-align:center"><button class="modal-action" id="connectStoreGameBtn">ربط حساب المتجر</button><p id="storeGameLinkStatus" role="status"></p>')+
    '<button class="ghost-action" id="closeGameRewardsBtn">إغلاق</button>');
  $("closeGameRewardsBtn").onclick=()=>$("modalLayer").classList.add("hidden");
  if(!linked){
    $("connectStoreGameBtn").onclick=async()=>{
      const button=$("connectStoreGameBtn"),status=$("storeGameLinkStatus"),code=$("storeGameLinkCode").value.trim();
      if(!/^[0-9a-f]{48}$/i.test(code)){status.textContent="تحقق من الرمز؛ يجب أن يتكون من 48 خانة.";return}
      button.disabled=true;status.textContent="جارٍ ربط الحساب بأمان...";
      try{
        const response=await fetch("/api/rewards/link",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({code})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||"تعذر ربط الحساب");
        await refreshGameRewards();
        status.textContent="تم ربط الحساب بنجاح! ❤️";
        setTimeout(openWallet,500);
      }catch(error){status.textContent=error.message;button.disabled=false}
    };
  }
}
$("gameRewardsBtn")?.addEventListener("click",openWallet);
window.refreshGameRewards=refreshGameRewards;
refreshGameRewards();
})();