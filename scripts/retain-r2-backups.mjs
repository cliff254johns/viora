import {S3Client,ListObjectsV2Command,DeleteObjectsCommand} from '@aws-sdk/client-s3';
const required=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
for(const k of required)if(!process.env[k])throw new Error('Missing required config: '+k);
const s3=new S3Client({region:'auto',endpoint:'https://'+process.env.R2_ACCOUNT_ID+'.r2.cloudflarestorage.com',credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const now=Date.now(),dailyCutoff=now-35*86400000,monthlyCutoff=now-365*86400000;
let token,objects=[];
do{const page=await s3.send(new ListObjectsV2Command({Bucket:process.env.R2_BUCKET,Prefix:'rtdb/',ContinuationToken:token}));objects.push(...(page.Contents||[]));token=page.IsTruncated?page.NextContinuationToken:undefined;}while(token);
const deletions=objects.filter(o=>{
 if(!o.Key||!o.LastModified)return false;
 const t=new Date(o.LastModified).getTime();
 return (o.Key.startsWith('rtdb/daily/')&&t<dailyCutoff)||(o.Key.startsWith('rtdb/monthly/')&&t<monthlyCutoff);
});
for(let i=0;i<deletions.length;i+=1000){
 const batch=deletions.slice(i,i+1000);
 await s3.send(new DeleteObjectsCommand({Bucket:process.env.R2_BUCKET,Delete:{Objects:batch.map(x=>({Key:x.Key})),Quiet:true}}));
}
console.log(JSON.stringify({event:'backup_retention_completed',scanned:objects.length,deleted:deletions.length,dailyRetentionDays:35,monthlyRetentionDays:365}));
