(()=>{"use strict";
const $=id=>document.getElementById(id);
let lastProfile=null;
async function refreshGameRewards(){
  const badge=$("redPointsBalance"),stageBadge=$("redPointsBalanceGame");
  try{
    const response=await fetch("/api/rewards/profile",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"تعذر تحميل الرصيد");
    lastProfile=data;
    const points=Number(data.points||0).toLocaleString("ar-IQ");
    if(badge)badge.textContent=points;
    if(stageBadge)stageBadge.textContent=points;
    return data;
  }catch{
    if(badge)badge.textContent="—";
    if(stageBadge)stageBadge.textContent="—";
    return null;
  }
}
function show(content){
  $("modalContent").innerHTML=content;
  $("modalLayer").classList.remove("hidden");
}
async function openWallet(){
  const profile=await refreshGameRewards();
  if(!profile){$("accountBtn").click();return}
  const linked=profile.linked===true;
  const points=Number(profile.points||0).toLocaleString("ar-IQ");
  const verified=Math.max(0,Number(profile.verifiedLevel||0));
  const remaining=10-(verified%10);
  show('<div class="modal-hero">❤️</div><div class="eyebrow">نقاط متجر آدم النور</div><h2>رصيدك الأحمر</h2><div style="font-size:34px;font-weight:900;color:#bd173c;margin:12px 0">❤️ '+points+'</div>'+
    (linked?'<p>حسابك مرتبط تلقائياً بحساب المتجر. أكملت '+verified+' مرحلة موثّقة.</p><p>أكمل '+remaining+' '+(remaining===1?'مرحلة':'مراحل')+' أخرى لتحصل على 200 نقطة حمراء تُضاف مباشرة إلى رصيدك في المتجر.</p>':
    '<p>لم يكتمل الدخول بحساب المتجر. ارجع إلى متجر آدم النور وسجّل الدخول، ثم اضغط «العب الآن» للدخول تلقائياً.</p><a href="https://feat-game-stage-rewards.adam-al-noor-books.pages.dev/?open=points" class="modal-action" style="display:block;text-align:center;text-decoration:none">العودة إلى المتجر</a>')+
    '<button class="ghost-action" id="closeGameRewardsBtn">إغلاق</button>');
  $("closeGameRewardsBtn").onclick=()=>$("modalLayer").classList.add("hidden");
}
$("gameRewardsBtn")?.addEventListener("click",openWallet);
window.refreshGameRewards=refreshGameRewards;
refreshGameRewards();
})();