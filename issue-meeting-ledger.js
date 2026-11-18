/* AetherPMO Personal · project issue register, bidirectional links and meeting attachments. */
(function () {
  'use strict';
  const app = window.app;
  if (!app || window.__aetherIssueLedgerV2) return;
  window.__aetherIssueLedgerV2 = true;

  const BUCKET = 'meeting-minutes-private';
  const MAX_SIZE = 30 * 1024 * 1024;
  const EXTENSIONS = new Set(['pdf','hwp','hwpx','doc','docx','xls','xlsx','ppt','pptx','txt','zip','png','jpg','jpeg']);
  const $ = id => document.getElementById(id);
  const db = () => app.useSupabase && !app.demoMode ? app.supabase : null;
  const dt = x => x ? String(x).slice(0,10) : '-';
  const fmtIssue = x => x.issueNumber ? 'ISS-' + String(x.issueNumber).padStart(3,'0') : 'ISS-미발번';
  const report = (message,error) => {
    console.error('[IssueLedger]',message,error);
    alert(message + (error ? '\n' + (error.message || String(error)) : ''));
  };

  function el(tag,txt,cls) {
    const v=document.createElement(tag);
    if(txt!==undefined) v.textContent=txt==null?'':String(txt);
    if(cls) v.className=cls;
    return v;
  }
  function action(label,callback,cls='btn btn-xs btn-outline') {
    const b=el('button',label,cls);b.type='button';b.addEventListener('click',callback);return b;
  }
  function cell(tr,text,cls) {
    const td=el('td',text,cls);tr.append(td);return td;
  }
  function fileExt(file) { return (String(file.name).split('.').pop()||'').toLowerCase(); }
  function validFiles(files) {
    for(const file of files) {
      if(file.size===0) throw Error('빈 파일은 등록할 수 없습니다: '+file.name);
      if(file.size>MAX_SIZE) throw Error('파일 크기는 30MB 이하여야 합니다: '+file.name);
      if(!EXTENSIONS.has(fileExt(file))) throw Error('지원하지 않는 확장자입니다: '+file.name);
    }
  }

  function requireDb() {
    const client=db();
    if(!client) throw Error('Personal Supabase에 로그인한 후 이용할 수 있습니다.');
    return client;
  }

  async function projectLinks(projectId) {
    const client=requireDb();
    const {data,error}=await client.from('issue_meeting_links')
      .select('issue_id,meeting_id').eq('project_id',projectId);
    if(error)throw error;
    return data||[];
  }
  async function projectFiles(projectId) {
    const client=requireDb();
    const {data,error}=await client.from('meeting_minute_files')
      .select('id,meeting_id').eq('project_id',projectId);
    if(error)throw error;
    return data||[];
  }

  const priorIssuesTable=app.renderProjectDetailIssuesTable.bind(app);
  app.renderProjectDetailIssuesTable=function(issues,tbodyId='project-detail-issues-tbody') {
    if(tbodyId!=='project-detail-issues-tbody') return priorIssuesTable(issues,tbodyId);
    const tbody=$(tbodyId);if(!tbody)return;
    tbody.replaceChildren();
    if(!issues.length) {
      const tr=el('tr');const td=cell(tr,'등록된 이슈가 없습니다.','text-center text-muted py-4');
      td.colSpan=10;tbody.append(tr);return;
    }
    const issueLinkCells=[];
    for(const i of [...issues].sort((a,b)=>(a.issueNumber||99999)-(b.issueNumber||99999))) {
      const tr=el('tr');
      cell(tr,fmtIssue(i),'font-bold text-xs');
      const title=cell(tr,'','font-bold text-xs');
      title.append(action(i.title,()=>app.openIssueDetailModal(i.id),'btn btn-xs btn-outline'));
      cell(tr,i.issueCategory || i.type || '-','text-xs');
      cell(tr,i.priority||'중','text-xs');
      cell(tr,[i.ownerOrganization,i.owner].filter(Boolean).join(' / ')||'-','text-xs');
      cell(tr,dt(i.reportedDate),'text-xs');
      cell(tr,dt(i.dueDate),'text-xs');
      cell(tr,i.status||'발생','text-xs');
      const related=cell(tr,'조회 중…','text-xs');
      issueLinkCells.push({i,related,tr});
      const ctrl=cell(tr,'','text-xs');
      ctrl.append(action('상세',()=>app.openIssueDetailModal(i.id)),
        action('수정',()=>app.openEditIssueModal(i.id)),
        action('삭제',()=>app.deleteIssue(i.id),'btn btn-xs btn-danger'));
      tbody.append(tr);
    }
    const projectId=issues[0].projectId;
    projectLinks(projectId).then(links=>{
      if(!tbody.isConnected)return;
      for(const {i,related,tr} of issueLinkCells){
        if(!tbody.contains(tr))continue;
        related.replaceChildren();
        const matches=links.filter(l=>l.issue_id===i.id);
        if(!matches.length) related.append(el('span','연결 없음','text-muted'));
        for(const l of matches.slice(0,2)){
          const m=(app.state.meetingMinutes||[]).find(x=>x.id===l.meeting_id);
          related.append(action(m?.title || '연결 회의록',()=>app.openMeetingMinutesDetailModal(l.meeting_id)));
        }
        if(matches.length>2)related.append(el('small',' 외 '+(matches.length-2)+'건'));
        related.append(action('+연결',()=>app.openIssueDetailModal(i.id),'btn btn-xs btn-outline'));
      }
    }).catch(error=>{
      for(const {related,tr} of issueLinkCells) if(tbody.contains(tr))related.textContent='조회 오류';
      console.error('[IssueLedger] link list',error);
    });
  };

  const priorMeetingsTable=app.renderProjectDetailMeetingMinutesTable.bind(app);
  app.renderProjectDetailMeetingMinutesTable=function(minutes) {
    const tbody=$('project-detail-minutes-tbody');
    if(!tbody)return priorMeetingsTable(minutes);
    tbody.replaceChildren();
    if(!minutes.length) {
      const tr=el('tr'),td=cell(tr,'등록된 회의록이 없습니다.','text-center text-muted py-4');
      td.colSpan=9;tbody.append(tr);return;
    }
    const cells=[];
    for(const m of minutes) {
      const tr=el('tr');
      const title=cell(tr,'','font-bold text-xs');
      title.append(action(m.title,()=>app.openMeetingMinutesDetailModal(m.id)));
      cell(tr,'회의록','text-xs');
      cell(tr,String(m.meetDate||'').replace('T',' ')||'-','text-xs');
      cell(tr,m.location||'-','text-xs');
      const author=(app.state.users||[]).find(u=>u.id===m.authorId)?.name
        || (String(m.remarks||'').startsWith('회의록 작성자: ') ? String(m.remarks).replace('회의록 작성자: ','') : '-');
      cell(tr,author,'text-xs');
      cell(tr,dt(m.meetDate),'text-xs');
      const related=cell(tr,'조회 중…','text-xs');
      const fileCell=cell(tr,'조회 중…','text-xs');
      cells.push({m,tr,related,fileCell});
      const ctrl=cell(tr,'','text-xs');
      ctrl.append(action('보기',()=>app.openMeetingMinutesDetailModal(m.id)),
        action('수정',()=>app.openEditMeetingMinutesModal(m.id)),
        action('삭제',()=>app.deleteMeetingMinutes(m.id),'btn btn-xs btn-danger'));
      tbody.append(tr);
    }
    const projectId=minutes[0].projectId;
    Promise.all([projectLinks(projectId),projectFiles(projectId)]).then(([links,files])=>{
      for(const {m,tr,related,fileCell} of cells){
        if(!tbody.contains(tr))continue;
        related.replaceChildren();fileCell.replaceChildren();
        const is=links.filter(l=>l.meeting_id===m.id);
        if(!is.length)related.append(el('span','연결 없음','text-muted'));
        for(const l of is.slice(0,2)){
          const issue=(app.state.issues||[]).find(x=>x.id===l.issue_id);
          related.append(action(issue ? fmtIssue(issue)+' '+issue.title : '연결 이슈',
            ()=>app.openIssueDetailModal(l.issue_id)));
        }
        if(is.length>2)related.append(el('small',' 외 '+(is.length-2)+'건'));
        related.append(action('+연결',()=>app.openMeetingMinutesDetailModal(m.id)));
        const fileCount=files.filter(f=>f.meeting_id===m.id).length;
        fileCell.append(action(fileCount ? '파일 '+fileCount+'건' : '+파일 첨부',
          ()=>app.openMeetingMinutesDetailModal(m.id)));
      }
    }).catch(error=>{
      for(const {tr,related,fileCell} of cells)if(tbody.contains(tr)){
        related.textContent='조회 오류';fileCell.textContent='조회 오류';
      }
      console.error('[IssueLedger] meeting link/files',error);
    });
  };

  function addDetailRow(table,id,title,value) {
    let row=$(id);
    if(!row) {
      row=el('tr');row.id=id;
      const th=el('th',title),td=el('td','','pre-wrap');
      row.append(th,td);table.append(row);
    }
    row.lastElementChild.textContent=value||'-';
  }
  const priorIssueDetail=app.openIssueDetailModal.bind(app);
  app.openIssueDetailModal=function(id) {
    priorIssueDetail(id);
    const i=(this.state.issues||[]).find(x=>x.id===id),table=$('issue-detail-modal')?.querySelector('table.detail-info-table');
    if(!i||!table)return;
    addDetailRow(table,'issue-ledger-number','이슈번호',fmtIssue(i));
    addDetailRow(table,'issue-ledger-field','이슈 분야',i.issueCategory);
    addDetailRow(table,'issue-ledger-org','담당기관 / 협력사',i.ownerOrganization);
    addDetailRow(table,'issue-ledger-duedate','조치 목표일',dt(i.dueDate));
    addDetailRow(table,'issue-ledger-desc','이슈 상세내용',i.description);
    addDetailRow(table,'issue-ledger-resolution','조치 결과',i.resolutionSummary);
    addDetailRow(table,'issue-ledger-validation','검증 결과 / 종료 근거',i.validationResult);
    addDetailRow(table,'issue-ledger-support','기술지원 접수',
      [i.supportChannel,i.supportReferenceNo].filter(Boolean).join(' / '));
  };
  const prevNewIssue=app.openNewIssueModal.bind(app);
  app.openNewIssueModal=function(...args) {
    prevNewIssue(...args);
    if($('issue-modal-title'))$('issue-modal-title').textContent='새 이슈 등록';
  };
  const prevEditIssue=app.openEditIssueModal.bind(app);
  app.openEditIssueModal=function(id) {
    prevEditIssue(id);
    if($('issue-modal-title'))$('issue-modal-title').textContent='이슈 정보 수정';
  };

  // Persist first, then update in-memory UI. Failed saves leave the form open.
  app.saveIssueForm=async function() {
    const id=$('issue-id-field')?.value || crypto.randomUUID();
    const projectId=$('issue-project-select')?.value || '';
    const title=$('issue-title')?.value.trim()||'';
    const owner=$('issue-owner')?.value.trim()||'';
    const reportedDate=$('issue-reported-date')?.value||'';
    if(!projectId||!title||!owner||!reportedDate){
      alert('프로젝트, 이슈명, 담당자, 발생일은 필수입니다.');return;
    }
    const current=(this.state.issues||[]).find(x=>x.id===id)||{};
    const status=$('issue-status')?.value||'발생';
    const i={
      ...current,id,projectId,title,owner,reportedDate,status,
      type:$('issue-type')?.value||'이슈',
      priority:$('issue-priority')?.value||'중',
      resolvedDate:status==='완료' ? ($('issue-resolved-date')?.value||dt(new Date().toISOString())):'',
      actionPlan:$('issue-action-plan')?.value.trim()||'',
      remarks:$('issue-remarks')?.value.trim()||'',
      description:$('issue-description')?.value.trim()||'',
      issueCategory:$('issue-category')?.value||'',
      ownerOrganization:$('issue-owner-org')?.value.trim()||'',
      dueDate:$('issue-due-date')?.value||'',
      resolutionSummary:$('issue-resolution-summary')?.value.trim()||'',
      validationResult:$('issue-validation-result')?.value.trim()||'',
      supportChannel:$('issue-support-channel')?.value||'',
      supportReferenceNo:$('issue-support-ref')?.value.trim()||''
    };
    const saveButton=$('issue-form')?.querySelector('button[type="submit"]');
    if(saveButton)saveButton.disabled=true;
    try {
      requireDb();
      await this.syncDb('issue_upsert',i);
      const pos=this.state.issues.findIndex(x=>x.id===id);
      if(pos>=0)this.state.issues[pos]=i;else this.state.issues.push(i);
      await this.loadStateFromSupabase();
      this.saveState();
      this.closeIssueModal();
      this.handleRouting();
    } catch (error) {
      report('이슈 저장에 실패했습니다. 입력 내용은 유지됩니다.',error);
    } finally {
      if(saveButton)saveButton.disabled=false;
    }
  };

  function meetingFormFileField() {
    const grid=$('meeting-minutes-form')?.querySelector('.form-grid');
    if(!grid||$('meeting-minutes-attachments-input'))return;
    const group=el('div',undefined,'form-group span-2');
    const label=el('label','회의록 원본 파일 첨부 (선택)');
    label.htmlFor='meeting-minutes-attachments-input';
    const input=el('input');input.type='file';input.multiple=true;input.id='meeting-minutes-attachments-input';
    input.accept='.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg';
    const info=el('small','PDF · HWP · HWPX · DOCX 등, 파일당 최대 30MB. 비공개 저장됩니다.','text-muted');
    group.append(label,input,info);grid.append(group);
  }
  meetingFormFileField();
  const priorNewMeeting=app.openNewMeetingMinutesModal.bind(app);
  app.openNewMeetingMinutesModal=function(...args) {
    meetingFormFileField();priorNewMeeting(...args);
  };
  const priorEditMeeting=app.openEditMeetingMinutesModal.bind(app);
  app.openEditMeetingMinutesModal=function(id) {
    meetingFormFileField();priorEditMeeting(id);
    if($('meeting-minutes-attachments-input'))$('meeting-minutes-attachments-input').value='';
  };

  async function uploadMeetingFile(meeting,file) {
    validFiles([file]);
    const client=requireDb();
    const path=meeting.projectId+'/'+meeting.id+'/'+crypto.randomUUID()+'.'+fileExt(file);
    const {error:upErr}=await client.storage.from(BUCKET).upload(path,file,{
      upsert:false, contentType:file.type||'application/octet-stream'
    });
    if(upErr)throw upErr;
    const {error:metaErr}=await client.from('meeting_minute_files').insert({
      project_id:meeting.projectId, meeting_id:meeting.id,storage_path:path,
      original_name:file.name,file_size:file.size,content_type:file.type||null
    });
    if(metaErr){
      try{await client.storage.from(BUCKET).remove([path]);}catch(cleanupError){
        console.warn('[IssueLedger] orphan file cleanup failed',cleanupError);
      }
      throw metaErr;
    }
  }

  app.saveMeetingMinutesForm=async function() {
    const existingId=$('meeting-minutes-id-field')?.value||'';
    const projectId=$('meeting-minutes-project-select')?.value||'';
    const title=$('meeting-minutes-title')?.value.trim()||'';
    const meetDate=$('meeting-minutes-date')?.value||'';
    const location=$('meeting-minutes-location')?.value.trim()||'';
    const attendees=$('meeting-minutes-attendees')?.value.trim()||'';
    const agenda=$('meeting-minutes-agenda')?.value.trim()||'';
    const decisions=$('meeting-minutes-decisions')?.value.trim()||'';
    const remarks=$('meeting-minutes-remarks')?.value.trim()||'';
    if(!projectId||!title||!meetDate||!location||!attendees||!agenda){
      alert('프로젝트, 회의명, 일시, 장소, 참석자, 회의 내용은 필수입니다.');return;
    }
    const files=Array.from($('meeting-minutes-attachments-input')?.files||[]);
    try{validFiles(files);}catch(error){report('첨부 파일을 확인해주세요.',error);return;}
    const id=existingId||crypto.randomUUID();
    const current=(this.state.meetingMinutes||[]).find(m=>m.id===id)||{};
    const meeting={...current,id,projectId,title,meetDate,location,attendees,agenda,decisions,remarks};
    const saveButton=$('meeting-minutes-form')?.querySelector('button[type="submit"]');
    if(saveButton)saveButton.disabled=true;
    try {
      requireDb();
      await this.syncDb('meeting_upsert',meeting);
      if($('meeting-minutes-id-field'))$('meeting-minutes-id-field').value=id;
      const ix=this.state.meetingMinutes.findIndex(m=>m.id===id);
      if(ix>=0)this.state.meetingMinutes[ix]=meeting;else this.state.meetingMinutes.push(meeting);
      await this.loadStateFromSupabase();
      this.saveState();
    } catch(error) {
      report('회의록 저장에 실패했습니다. 입력 내용은 유지됩니다.',error);
      if(saveButton)saveButton.disabled=false;return;
    }
    const failed=[];
    for(const file of files){
      try{await uploadMeetingFile(meeting,file);}catch(error){
        console.error('[IssueLedger] meeting upload',file.name,error);
        failed.push(file.name+': '+(error?.message||'업로드 오류'));
      }
    }
    this.closeMeetingMinutesModal();
    this.handleRouting();
    if(saveButton)saveButton.disabled=false;
    if(failed.length)alert('회의록은 저장되었지만 일부 파일 업로드에 실패했습니다.\n'+failed.join('\n')+
      '\n회의록 상세의 원본 파일 영역에서 다시 올릴 수 있습니다.');
  };

  // Uploaded files are private: each download uses a short-lived signed URL.
  async function downloadAttachment(f) {
    try{
      const {data,error}=await requireDb().storage.from(BUCKET)
        .createSignedUrl(f.storage_path,90,{download:f.original_name});
      if(error)throw error;
      const anchor=el('a');anchor.href=data.signedUrl;anchor.target='_blank';
      anchor.rel='noopener noreferrer';anchor.download=f.original_name;
      document.body.append(anchor);anchor.click();anchor.remove();
    }catch(error){report('회의록 파일을 열지 못했습니다.',error);}
  }
  async function deleteAttachment(meeting,f) {
    if(!confirm('회의록 원본 파일 "'+f.original_name+'"을(를) 삭제할까요?'))return;
    try {
      const client=requireDb();
      const {error:storageErr}=await client.storage.from(BUCKET).remove([f.storage_path]);
      if(storageErr)throw storageErr;
      const {error:metaErr}=await client.from('meeting_minute_files').delete()
        .eq('id',f.id).eq('meeting_id',meeting.id).eq('project_id',meeting.projectId);
      if(metaErr)throw metaErr;
      await showMeetingAttachments(meeting.id);
      if($('project-detail-minutes-tbody')?.isConnected)
        app.renderProjectDetailMeetingMinutesTable((app.state.meetingMinutes||[]).filter(m=>m.projectId===meeting.projectId));
    }catch(error){report('첨부 파일 삭제에 실패했습니다.',error);}
  }

  async function showMeetingAttachments(meetingId) {
    const meeting=(app.state.meetingMinutes||[]).find(m=>m.id===meetingId);
    const body=$('meeting-minutes-detail-modal')?.querySelector('.detail-modal-body');
    if(!meeting||!body)return;
    app.__ledgerOpenMeetingId=meetingId;
    let section=$('meeting-ledger-file-section');
    if(!section){
      section=el('section');section.id='meeting-ledger-file-section';
      section.style.cssText='margin:16px 0;padding:14px;border:1px solid var(--bg-card-border);border-radius:8px;';
      body.append(section);
    }
    section.replaceChildren(el('h3','회의록 원본 파일','font-bold text-sm'));
    const desc=el('p','원본 파일은 비공개로 저장되며 로그인한 권한자만 열 수 있습니다.','text-muted text-xs');
    section.append(desc);
    const chooser=el('input');chooser.type='file';chooser.multiple=true;
    chooser.accept='.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg';
    chooser.style.cssText='display:block;max-width:100%;margin:10px 0;';
    const uploadBtn=action('파일 업로드',async ()=>{
      const files=Array.from(chooser.files||[]);
      if(!files.length){alert('업로드할 파일을 선택해주세요.');return;}
      try{validFiles(files);}catch(error){report('첨부 파일을 확인해주세요.',error);return;}
      uploadBtn.disabled=true;uploadBtn.textContent='업로드 중…';
      const errs=[];
      for(const f of files)try{await uploadMeetingFile(meeting,f);}catch(error){
        errs.push(f.name+': '+(error?.message||'오류'));
      }
      if(app.__ledgerOpenMeetingId===meetingId)await showMeetingAttachments(meetingId);
      if(errs.length)alert('일부 파일을 업로드하지 못했습니다.\n'+errs.join('\n'));
      if($('project-detail-minutes-tbody')?.isConnected)
        app.renderProjectDetailMeetingMinutesTable((app.state.meetingMinutes||[]).filter(m=>m.projectId===meeting.projectId));
    },'btn btn-sm btn-primary');
    section.append(chooser,uploadBtn);
    const list=el('div','조회 중…','text-muted text-xs');
    list.style.marginTop='12px';section.append(list);
    try{
      const {data,error}=await requireDb().from('meeting_minute_files')
        .select('id,project_id,meeting_id,storage_path,original_name,file_size,created_at')
        .eq('project_id',meeting.projectId).eq('meeting_id',meeting.id)
        .order('created_at',{ascending:false});
      if(error)throw error;
      if(app.__ledgerOpenMeetingId!==meetingId || !section.isConnected)return;
      list.replaceChildren();
      if(!data?.length){list.append(el('p','첨부된 파일이 없습니다.'));return;}
      for(const f of data){
        const row=el('div');row.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;';
        const filename=action(f.original_name+' ('+Math.ceil(f.file_size/1024)+'KB)',
          ()=>downloadAttachment(f));
        filename.style.cssText='min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:left;';
        row.append(filename,action('삭제',()=>deleteAttachment(meeting,f),'btn btn-xs btn-danger'));
        list.append(row);
      }
    }catch(error){
      list.textContent='파일 목록 조회 실패: '+(error?.message||'오류');
      console.error('[IssueLedger] file list',error);
    }
  }

  const priorMeetingDetail=app.openMeetingMinutesDetailModal.bind(app);
  app.openMeetingMinutesDetailModal=function(id) {
    priorMeetingDetail(id);void showMeetingAttachments(id);
  };

  app.deleteIssue=async function(id) {
    const item=(this.state.issues||[]).find(i=>i.id===id);
    if(!item || !confirm('이 이슈를 삭제하시겠습니까? 연결된 회의록 관계도 해제됩니다.'))return;
    try{
      requireDb();
      await this.syncDb('issue_delete',id);
      await this.loadStateFromSupabase();
      this.saveState();
      this.handleRouting();
    }catch(error){report('이슈 삭제에 실패했습니다.',error);}
  };

  app.deleteMeetingMinutes=async function(id) {
    const meeting=(this.state.meetingMinutes||[]).find(m=>m.id===id);
    if(!meeting || !confirm('회의록을 삭제하시겠습니까? 첨부된 원본 파일도 함께 삭제됩니다.'))return;
    try {
      const client=requireDb();
      const {data,error}=await client.from('meeting_minute_files')
        .select('storage_path').eq('project_id',meeting.projectId).eq('meeting_id',meeting.id);
      if(error)throw error;
      const paths=(data||[]).map(f=>f.storage_path);
      if(paths.length){
        const {error:storageErr}=await client.storage.from(BUCKET).remove(paths);
        if(storageErr)throw storageErr;
      }
      await this.syncDb('meeting_delete',id);
      await this.loadStateFromSupabase();
      this.saveState();
      this.handleRouting();
    }catch(error){report('회의록 삭제에 실패했습니다. 일부 파일은 삭제됐을 수 있으니 파일 목록을 확인해주세요.',error);}
  };

  window.addEventListener('aether:issue-meeting-links-changed',e=>{
    const projectId=e.detail?.projectId||app.activeProjectId;
    if(!projectId)return;
    if($('project-detail-issues-tbody')?.isConnected){
      app.renderProjectDetailIssuesTable((app.state.issues||[]).filter(i=>i.projectId===projectId && (i.type==='이슈'||!i.type||i.type==='이슈/리스크')));
    }
    if($('project-detail-minutes-tbody')?.isConnected){
      app.renderProjectDetailMeetingMinutesTable((app.state.meetingMinutes||[]).filter(m=>m.projectId===projectId));
    }
  });

  console.log('[AetherPMO Personal] issue register and secure meeting attachments enabled');
})();