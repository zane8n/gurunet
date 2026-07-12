import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api, signIn } from "@/lib/client";

type Bootstrap={challenge?:{id:string;title:string;topic:string;difficulty:string;scenario:string;objective:string;deadlineAt:string;status:string};user:{name:string;currentStreak:number};onboardingRequired?:boolean};
export default function TodayScreen(){
 const [data,setData]=useState<Bootstrap|null>(null);const [error,setError]=useState("");const [authNeeded,setAuthNeeded]=useState(false);
 const load=()=>{setError("");return api.request<Bootstrap>("/bootstrap").then(result=>{setData(result);setAuthNeeded(false)}).catch(e=>{if(e?.status===401)setAuthNeeded(true);else setError(e.message)})};
 useEffect(()=>{void load()},[]); if(authNeeded)return <LoginPrompt onDone={load}/>; if(!data&&!error)return <View style={s.center}><ActivityIndicator color="#167d87"/></View>;
 return <ScrollView style={s.page} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load}/> }>
  <Text style={s.eyebrow}>DAILY CAPACITY PRACTICE</Text><Text style={s.h1}>Good day, {data?.user.name?.split(" ")[0]??"learner"}.</Text>
  {error?<Text style={s.error}>{error}</Text>:null}{data?.challenge?<View>
   <View style={s.meta}><Text style={s.badge}>{data.challenge.difficulty}</Text><Text style={s.muted}>{data.challenge.topic}</Text><Text style={s.muted}>Streak {data.user.currentStreak}</Text></View>
   <Text style={s.title}>{data.challenge.title}</Text><Text style={s.body}>{data.challenge.scenario}</Text>
   <View style={s.rule}/><Text style={s.label}>Objective</Text><Text style={s.body}>{data.challenge.objective}</Text>
   <Pressable style={s.primary} onPress={()=>router.push({pathname:"/respond",params:{challengeId:data.challenge!.id}})}><Text style={s.primaryText}>Start response</Text></Pressable>
  </View>:<Text style={s.body}>Your next challenge will appear here.</Text>}
</ScrollView>;
}
function LoginPrompt({onDone}:{onDone:()=>Promise<void>|void}){const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[busy,setBusy]=useState(false);const[error,setError]=useState("");async function submit(){setBusy(true);setError("");try{await signIn(email,password);await onDone()}catch(e:any){setError(e.message??"Unable to sign in")}finally{setBusy(false)}}return <View style={s.login}><Text style={s.eyebrow}>GURUNET APP</Text><Text style={s.h1}>Sign in to continue.</Text><TextInput style={s.input} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail}/><TextInput style={s.input} secureTextEntry placeholder="Password" value={password} onChangeText={setPassword}/>{error?<Text style={s.error}>{error}</Text>:null}<Pressable style={[s.primary,busy&&s.disabled]} disabled={busy} onPress={submit}><Text style={s.primaryText}>{busy?"Signing in...":"Sign in"}</Text></Pressable></View>}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#f7f8f8"},content:{padding:20,paddingBottom:48},center:{flex:1,alignItems:"center",justifyContent:"center"},login:{flex:1,justifyContent:"center",padding:24,backgroundColor:"#f7f8f8"},eyebrow:{fontSize:12,fontWeight:"700",color:"#167d87",letterSpacing:1},h1:{fontSize:30,fontWeight:"500",color:"#172126",marginTop:8,marginBottom:28},input:{height:52,borderWidth:1,borderColor:"#cfd9da",borderRadius:7,paddingHorizontal:14,backgroundColor:"#fff",fontSize:16,marginBottom:12},meta:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:14},badge:{backgroundColor:"#dceff0",color:"#145f66",paddingHorizontal:10,paddingVertical:5,borderRadius:4},muted:{color:"#657278",fontSize:13},title:{fontSize:25,lineHeight:31,fontWeight:"600",color:"#172126",marginBottom:14},body:{fontSize:16,lineHeight:25,color:"#39474c"},label:{fontSize:13,fontWeight:"700",color:"#172126",marginBottom:8},rule:{height:1,backgroundColor:"#dce3e4",marginVertical:24},primary:{backgroundColor:"#167d87",borderRadius:7,padding:16,alignItems:"center",marginTop:18},primaryText:{color:"white",fontWeight:"700",fontSize:16},disabled:{opacity:.6},error:{color:"#b84d49",marginTop:4}});
