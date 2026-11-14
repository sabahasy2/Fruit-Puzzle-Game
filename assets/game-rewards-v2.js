(()=>{"use strict";
const $=id=>document.getElementById(id);
const STORE_URL=location.hostname==="fruit-pop-puzzle.pages.dev"?"https://adam-al-noor-books.pages.dev":"https://feat-game-stage-rewards.adam-al-noor-books.pages.dev";
let lastProfile=null;
const formatIqd=value=>Math.max(0,Number(value)||0).toLocaleString("ar-IQ")+" د.ع";
const decorativeUsd=value=>((Math.max(0,Number(value)||0)/500)*0.45).toFixed(2);
async function refreshGameRewards(){
  const badge=$("redPointsBalance"),stageBadge=$("redPointsBalanceGame"),usdBadge=$("redPointsUsdBalance");
  try{
    const response=await fetch("/api/rewards/profile",{credentials:"same-origin",cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"تعذر تحميل الرصيد");
    lastProfile=data;
    const balance=Number(data.gameBalanceIqd||0);
    if(badge)badge.textContent=formatIqd(balance);
    if(stageBadge)stageBadge.textContent=formatIqd(balance);
    if(usdBadge)usdBadge.textContent="~$"+decorativeUsd(balance);
    return data;
  }catch{
    if(badge)badge.textContent="—";
    if(stageBadge)stageBadge.textContent="—";
    if(usdBadge)usdBadge.textContent="—";
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
  const balance=Number(profile.gameBalanceIqd||0);
  const amount=formatIqd(balance);
  const usd=decorativeUsd(balance);
  const verified=Math.max(0,Number(profile.verifiedLevel||0));
  const remaining=10-(verified%10);
  show('<div class="modal-hero">❤️</div><div class="eyebrow">محفظة اللعبة في متجر آدم النور</div><h2>رصيدك من اللعبة</h2><div style="font-size:32px;font-weight:900;color:#bd173c;margin:12px 0">❤️ '+amount+'</div><div style="font-size:16px;font-weight:800;color:#8f2942">~$'+usd+' <small style="font-size:11px;font-weight:500">قيمة شكلية للعرض فقط</small></div>'+
    (linked?'<p>حسابك مرتبط تلقائياً بحساب المتجر. أكملت '+verified+' مرحلة موثّقة.</p><p>أكمل '+remaining+' '+(remaining===1?'مرحلة':'مراحل')+' أخرى لتحصل على 500 د.ع تضاف إلى رصيد اللعبة.</p>':
    '<p>لم يكتمل الدخول بحساب المتجر. ارجع إلى متجر آدم النور وسجّل الدخول، ثم اضغط «افتح اللعبة» للدخول تلقائياً.</p><a href="'+STORE_URL+'/?open=points" class="modal-action" style="display:block;text-align:center;text-decoration:none">العودة إلى المتجر</a>')+
    '<p style="font-size:12px;color:#77515b">هذا رصيد افتراضي مخصص لشراء الكتب داخل متجر آدم النور فقط. لا يمكن سحبه أو تحويله أو استخدامه خارج المتجر. قيمة الدولار للزينة فقط وليست سعر صرف.</p>'+
    '<button class="ghost-action" id="closeGameRewardsBtn">إغلاق</button>');
  $("closeGameRewardsBtn").onclick=()=>$("modalLayer").classList.add("hidden");
}
$("gameRewardsBtn")?.addEventListener("click",openWallet);
window.refreshGameRewards=refreshGameRewards;
refreshGameRewards();
})();