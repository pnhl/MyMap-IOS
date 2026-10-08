import {useEffect,useState} from 'react';
import {subscribeAuthState} from '../services/auth';
/** Refocus data effects when account identity changes, including initial sign-in. */
export function useAccountEpoch(){const[epoch,setEpoch]=useState(0);useEffect(()=>{let last:string|undefined;return subscribeAuthState((_event,session)=>{const next=session?.user.id||'local';if(next!==last){last=next;setEpoch(v=>v+1);}});},[]);return epoch;}
