import {buildScale} from './territorialData'
self.onmessage=({data})=>{try{self.postMessage({rows:buildScale(data.dataset,data.scale)})}catch(e){self.postMessage({error:e.message})}}
