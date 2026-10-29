const host=document.getElementById('settingsBackup');
if(!host)throw Error('설정 백업 화면을 찾을 수 없습니다.');
CZFavoritesBackupUI.attach(host,async()=>{}, {settings:true});
