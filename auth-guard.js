// auth-guard.js
// I-check kung naka-login ang user. Kung wala, ipadala sa login.html.
// Ilagay ang script tag na ito sa <head>, PAGKATAPOS ng supabase-config.js.

(async function guardPage(){
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session){
      window.location.href = "login.html";
      return;
    }
    document.documentElement.style.visibility = "visible";
  }catch(err){
    console.error('Auth guard error:', err);
    window.location.href = "login.html";
  }
})();

async function logout(){
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
}

supabaseClient.auth.onAuthStateChange((event)=>{
  if(event === "SIGNED_OUT"){
    window.location.href = "login.html";
  }
});
