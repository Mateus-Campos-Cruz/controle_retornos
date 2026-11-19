const api = {
  async request(path, method='GET', data) {
    if(location.protocol==='file:')throw Error('Abra a aplicação pelo endereço do servidor. O login seguro não funciona abrindo o arquivo HTML diretamente.');
    let response;
    try {response=await fetch('/api'+path,{method,credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});}
    catch {throw Error('Não foi possível conectar ao servidor. Verifique sua conexão.');}
    const result=await response.json().catch(()=>({error:'Resposta inválida do servidor.'}));
    if(!response.ok){
      if(response.status===401&&path!=='/login'&&sessionUser){clearSession();showLogin('Sua sessão expirou. Entre novamente.');}
      const error=Error(result.error||'Não foi possível concluir a operação.');error.status=response.status;throw error;
    }
    return result;
  }
};
const passwordHelp='Use de 8 a 128 caracteres, pelo menos uma letra maiúscula, um número e um caractere especial.';
function validatePassword(password,confirmation){
  if([...password].length<8||[...password].length>128||!/\p{Lu}/u.test(password)||!/[0-9]/.test(password)||!/[^\p{L}\p{N}\s]/u.test(password))throw Error(passwordHelp);
  if(password!==confirmation)throw Error('A confirmação da senha não confere.');
}
function passwordFields(){return '<p class="login-note">'+passwordHelp+'</p><div class="field"><label for="newPassword">Nova senha</label><input id="newPassword" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div><div class="field"><label for="confirmPassword">Confirmar senha</label><input id="confirmPassword" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>';}
