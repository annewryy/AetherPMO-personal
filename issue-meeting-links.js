/* Personal Supabase compatibility and bidirectional issue <-> meeting linking. */
(function () {
  'use strict';
  const app = window.app;
  if (!app || window.__issueMeetingLinksV1) return;
  window.__issueMeetingLinksV1 = true;
  const get = id => document.getElementById(id);
  const db = () => app.useSupabase && !app.demoMode ? app.supabase : null;
  const showError = (e, title) => { console.error('[issue-meeting-links]', title, e); alert(title + ': ' + (e?.message || '연동 오류')); };
  const firstDate = v => v ? String(v).slice(0, 10) : '';
  const issueToUi = i => ({
    id:i.id, projectId:i.project_id, title:i.title,
    type:i.type || i.category || '이슈', priority:i.priority || ({'높음':'상','보통':'중','낮음':'하'}[i.impact] || '중'),
    owner:i.owner || i.assignee || '', status:i.status || '발생',
    reportedDate:i.reported_date || firstDate(i.created_at), resolvedDate:i.resolved_date || '',
    actionPlan:i.action_plan || i.solution || '', remarks:i.remarks || '',
    reviewComment:i.review_comment || '', description:i.description || '',
    supportChannel:i.support_channel || '', supportReferenceNo:i.support_reference_no || '',
    dueDate:i.due_date || '', resolutionSummary:i.resolution_summary || '',
    issueNumber:i.issue_number || null, ownerOrganization:i.owner_organization || '',
    validationResult:i.validation_result || '', issueCategory:i.issue_category || ''
  });
  const meetingLocalDate = (m) => {
    if (m.meet_date) {
      const parsed=new Date(m.meet_date);
      if(!Number.isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat('sv-SE', {
          timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
          hour:'2-digit',minute:'2-digit',hourCycle:'h23'
        }).format(parsed).replace(' ','T');
      }
    }
    return m.date ? String(m.date).slice(0,10)+'T00:00' : String(m.created_at||'').slice(0,16);
  };
  const meetingToUi = m => ({
    id:m.id, projectId:m.project_id, title:m.title,
    meetDate:meetingLocalDate(m),
    location:m.location || '', attendees:Array.isArray(m.attendees) ? m.attendees.join(', ') : (m.attendees || ''),
    content:m.content || m.agenda || '', agenda:m.agenda || m.content || '',
    decisions:m.decisions || '', remarks:m.remarks || '', authorId:m.author_id || null
  });
  const load = app.loadStateFromSupabase.bind(app);
  app.loadStateFromSupabase = async function (...args) {
    const result = await load(...args);
    if (!db()) return result;
    const [ir, mr] = await Promise.all([db().from('issues').select('*'), db().from('meeting_minutes').select('*')]);
    if (ir.error) console.error('[issue-meeting-links] issues', ir.error);
    else this.state.issues = (ir.data || []).map(issueToUi);
    if (mr.error) console.error('[issue-meeting-links] meeting_minutes', mr.error);
    else this.state.meetingMinutes = (mr.data || []).map(meetingToUi);
    return result;
  };
  const sync = app.syncDb.bind(app);
  app.syncDb = async function (type, value, extra) {
    if (!db() || !['issue_upsert','issue_delete','meeting_upsert','meeting_delete'].includes(type))
      return sync(type,value,extra);
    if (!navigator.onLine) throw new Error('오프라인에서는 저장할 수 없습니다.');
    let result;
    if (type === 'issue_upsert') {
      const i = value;
      if (get('issue-modal')?.classList.contains('open')) {
        i.description = get('issue-description')?.value.trim() || '';
        i.supportChannel = get('issue-support-channel')?.value || '';
        i.supportReferenceNo = get('issue-support-ref')?.value.trim() || '';
        i.ownerOrganization = get('issue-owner-org')?.value.trim() || '';
        i.dueDate = get('issue-due-date')?.value || '';
        i.resolutionSummary = get('issue-resolution-summary')?.value.trim() || '';
        i.validationResult = get('issue-validation-result')?.value.trim() || '';
        i.issueCategory = get('issue-category')?.value || '';
      }
      result = await db().from('issues').upsert({
        id:i.id, project_id:i.projectId, title:i.title, type:i.type || '이슈',
        category:i.type || '이슈', priority:i.priority || '중',
        impact:({'상':'높음','중':'보통','하':'낮음'}[i.priority] || '보통'),
        owner:i.owner || '', assignee:i.owner || '', reported_date:i.reportedDate || null,
        resolved_date:i.resolvedDate || null, status:i.status || '발생',
        review_comment:i.reviewComment || null, action_plan:i.actionPlan || null,
        solution:i.actionPlan || null, remarks:i.remarks || null,
        description:i.description || null, due_date:i.dueDate || null,
        resolution_summary:i.resolutionSummary || null,
        support_channel:i.supportChannel || null, support_reference_no:i.supportReferenceNo || null,
        owner_organization:i.ownerOrganization || null, validation_result:i.validationResult || null,
        issue_category:i.issueCategory || null,
        updated_at:new Date().toISOString()
      },{onConflict:'id'});
    } else if (type === 'issue_delete') {
      result = await db().from('issues').delete().eq('id',value);
    } else if (type === 'meeting_upsert') {
      const m=value, t=m.meetDate || '', parsed=t?new Date(t):null;
      result = await db().from('meeting_minutes').upsert({
        id:m.id, project_id:m.projectId, title:m.title,
        date:firstDate(t) || null,
        meet_date:parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
        location:m.location || '',
        attendees:Array.isArray(m.attendees)?m.attendees.join(', '):(m.attendees || ''),
        content:m.agenda || m.content || '', agenda:m.agenda || '',
        decisions:m.decisions || '', remarks:m.remarks || '',
        author_id:this.isUuid(m.authorId)?m.authorId:null,
        updated_at:new Date().toISOString()
      },{onConflict:'id'});
    } else {
      result = await db().from('meeting_minutes').delete().eq('id',value);
    }
    if(result.error) throw result.error;
    return result;
  };
  function extraIssueFields() {
    const grid=get('issue-form')?.querySelector('.form-grid');
    if(!grid || get('issue-description')) return;
    for (const [id,label,tag] of [
      ['issue-description','이슈 상세내용','textarea'],
      ['issue-category','이슈 분야','select-category'],
      ['issue-owner-org','담당기관 / 협력사','input'],
      ['issue-due-date','조치 목표일','input-date'],
      ['issue-resolution-summary','조치 결과','textarea'],
      ['issue-validation-result','검증 결과 및 종료 근거','textarea'],
      ['issue-support-channel','기술지원 접수유형','select'],
      ['issue-support-ref','SR / IRM / ma.support 접수번호','input']]) {
      const group=document.createElement('div');group.className='form-group span-2';
      const l=document.createElement('label');l.htmlFor=id;l.textContent=label;group.append(l);
      const field=document.createElement(tag==='input-date'?'input':tag==='select-category'?'select':tag);field.id=id;
      if(tag==='select') for (const [value,text] of [['','선택 안 함'],['SR','SR'],['IRM','IRM'],['ma.support','ma.support']]) field.add(new Option(text,value));
      if(tag==='textarea') field.rows=3;
      if(tag==='input') field.type='text';
      if(tag==='input-date') field.type='date';
      if(tag==='select-category') for(const [value,text] of [['','선택 안 함'],['기술','기술'],['장애','장애'],['일정','일정'],['요구사항','요구사항'],['의사결정','의사결정'],['기타','기타']]) field.add(new Option(text,value));
      group.append(field);grid.append(group);
    }
  }
  extraIssueFields();
  const openNew=app.openNewIssueModal.bind(app);
  app.openNewIssueModal=function(...args){openNew(...args);extraIssueFields();
    for(const id of ['issue-description','issue-category','issue-owner-org','issue-due-date','issue-resolution-summary','issue-validation-result','issue-support-channel','issue-support-ref']) if(get(id)) get(id).value='';
  };
  const openEdit=app.openEditIssueModal.bind(app);
  app.openEditIssueModal=function(id){openEdit(id);extraIssueFields();
    const i=this.state.issues.find(x=>x.id===id);if(!i)return;
    get('issue-description').value=i.description || '';
    get('issue-category').value=i.issueCategory || '';
    get('issue-owner-org').value=i.ownerOrganization || '';
    get('issue-due-date').value=i.dueDate || '';
    get('issue-resolution-summary').value=i.resolutionSummary || '';
    get('issue-validation-result').value=i.validationResult || '';
    get('issue-support-channel').value=i.supportChannel || '';
    get('issue-support-ref').value=i.supportReferenceNo || '';
  };
  function createSection(modalId,id,title) {
    const body=document.querySelector('#'+modalId+' .detail-modal-body');if(!body)return;
    let el=get(id);
    if(!el){el=document.createElement('section');el.id=id;
      el.style.cssText='margin:16px 0;padding:14px;border:1px solid var(--bg-card-border);border-radius:8px;';
      body.append(el);
    }
    el.replaceChildren();const h=document.createElement('h3');h.className='font-bold text-sm';h.textContent=title;el.append(h);return el;
  }
  function paragraph(section,text) {const p=document.createElement('p');p.className='text-muted text-xs';p.textContent=text;section.append(p);return p;}
  function button(text,action,danger) {
    const b=document.createElement('button');b.type='button';b.className='btn btn-xs '+(danger?'btn-danger':'btn-outline');
    b.textContent=text;b.addEventListener('click',action);return b;
  }
  function row(section,label,open,remove) {
    const div=document.createElement('div');div.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0;';
    const link=button(label,open,false);link.style.cssText='text-align:left;white-space:normal;min-width:0;';
    div.append(link,button('해제',remove,true));section.append(div);
  }
  function picker(section,items,submit) {
    if(!items.length){paragraph(section,'추가 연결할 항목이 없습니다.');return;}
    const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;margin-top:10px;';
    const select=document.createElement('select');select.style.cssText='flex:1;min-width:0;';
    items.forEach(x=>select.add(new Option(x.title||x.id,x.id)));
    wrap.append(select,button('연결',()=>submit(select.value),false));section.append(wrap);
  }
  async function links(projectId, field, id) {
    if(!db())throw new Error('로그인 후 Supabase 연결이 필요합니다.');
    const {data,error}=await db().from('issue_meeting_links')
      .select('id,project_id,issue_id,meeting_id').eq('project_id',projectId).eq(field,id);
    if(error)throw error;return data||[];
  }
  async function link(projectId,issueId,meetingId,refresh) {
    const {error}=await db().from('issue_meeting_links')
      .upsert({project_id:projectId,issue_id:issueId,meeting_id:meetingId},{onConflict:'issue_id,meeting_id'});
    if(error)return showError(error,'연결 저장 실패');window.dispatchEvent(new CustomEvent('aether:issue-meeting-links-changed',{detail:{projectId}}));await refresh();
  }
  async function unlink(projectId,issueId,meetingId,refresh) {
    const {error}=await db().from('issue_meeting_links').delete()
      .eq('project_id',projectId).eq('issue_id',issueId).eq('meeting_id',meetingId);
    if(error)return showError(error,'연결 해제 실패');window.dispatchEvent(new CustomEvent('aether:issue-meeting-links-changed',{detail:{projectId}}));await refresh();
  }
  async function showIssueMeetings(id) {
    const issue=app.state.issues.find(i=>i.id===id);if(!issue)return;
    const section=createSection('issue-detail-modal','issue-related-meetings','연결된 회의록');if(!section)return;
    const waiting=paragraph(section,'조회 중...');
    try{
      const data=await links(issue.projectId,'issue_id',issue.id);
      if(app.activeIssueId!==id || !get('issue-detail-modal')?.classList.contains('open'))return;
      waiting.remove();if(!data.length)paragraph(section,'연결된 회의록이 없습니다.');
      const found=new Set(data.map(l=>l.meeting_id));
      for(const l of data){
        const m=(app.state.meetingMinutes||[]).find(x=>x.id===l.meeting_id);
        row(section,m?m.title+' · '+firstDate(m.meetDate):l.meeting_id,
          ()=>{get('issue-detail-modal').classList.remove('open');app.openMeetingMinutesDetailModal(l.meeting_id);},
          ()=>unlink(issue.projectId,issue.id,l.meeting_id,()=>showIssueMeetings(id)));
      }
      picker(section,(app.state.meetingMinutes||[]).filter(m=>m.projectId===issue.projectId&&!found.has(m.id)),
        meetingId=>link(issue.projectId,issue.id,meetingId,()=>showIssueMeetings(id)));
    }catch(e){waiting.remove();paragraph(section,'불러올 수 없습니다.');console.error('[issue-meeting-links]',e);}
  }
  async function showMeetingIssues(id) {
    const m=app.state.meetingMinutes.find(x=>x.id===id);if(!m)return;
    const section=createSection('meeting-minutes-detail-modal','meeting-related-issues','연결된 이슈');if(!section)return;
    const waiting=paragraph(section,'조회 중...');
    try{
      const data=await links(m.projectId,'meeting_id',m.id);
      if(!get('meeting-minutes-detail-modal')?.classList.contains('open'))return;
      waiting.remove();if(!data.length)paragraph(section,'연결된 이슈가 없습니다.');
      const found=new Set(data.map(l=>l.issue_id));
      for(const l of data){
        const i=(app.state.issues||[]).find(x=>x.id===l.issue_id);
        row(section,i?i.title:l.issue_id,
          ()=>{get('meeting-minutes-detail-modal').classList.remove('open');app.openIssueDetailModal(l.issue_id);},
          ()=>unlink(m.projectId,l.issue_id,m.id,()=>showMeetingIssues(id)));
      }
      picker(section,(app.state.issues||[]).filter(i=>i.projectId===m.projectId&&!found.has(i.id)),
        issueId=>link(m.projectId,issueId,m.id,()=>showMeetingIssues(id)));
    }catch(e){waiting.remove();paragraph(section,'불러올 수 없습니다.');console.error('[issue-meeting-links]',e);}
  }
  const issueDetail=app.openIssueDetailModal.bind(app);
  app.openIssueDetailModal=function(id){issueDetail(id);showIssueMeetings(id);};
  const meetingDetail=app.openMeetingMinutesDetailModal.bind(app);
  app.openMeetingMinutesDetailModal=function(id){meetingDetail(id);showMeetingIssues(id);};
  console.log('[AetherPMO Personal] Issue-meeting linking enabled.');
})();