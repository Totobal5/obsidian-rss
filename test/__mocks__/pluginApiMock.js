export function registerAPI() { /* no-op mock */ }
export function getAPI() { return {}; }
export function pluginApi(_name){
	return {
		isSpeaking: ()=>false,
		isPaused: ()=>false,
		pause: ()=>{},
		resume: ()=>{},
		say: (_title,_content)=>{},
	};
}
