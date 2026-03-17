import ollama
import json

class CoachingAgent:
    def __init__(self, model="llama3"):
        self.model = model
        self.client = ollama.AsyncClient()

    async def get_coaching_tip(self, exercise, current_stats):
        stats_data = json.loads(current_stats)
        
        # Determine if it's a voice query or an automated rep tip
        user_query = stats_data.get('user_speech', '')
        
        if user_query:
            prompt = f"""
            Identify as an Elite Biomechanics Coach.
            Context: Exercise {exercise}, Current Reps: {stats_data['reps']}
            User Question: "{user_query}"
            
            Task:
            1. Answer the gym question immediately and technically.
            2. If they ask about form, explain why stability matters.
            3. Maximum 30 words.
            4. Tone: Technical and encouraging.
            """
        else:
            prompt = f"""
            You are an elite AI Biomechanics Coach. 
            Input Context:
            - Exercise: {exercise}
            - Reps: {stats_data['reps']}
            - Tempo (s/rep): {stats_data.get('avg_tempo', 'N/A')}
            - Movement Velocity: {stats_data.get('velocity', 'N/A')}
            
            Analyze the movement. Provide a 1-sentence technical, gritty coaching tip.
            """
            
        try:
            response = await self.client.chat(model=self.model, messages=[
                {'role': 'user', 'content': prompt}
            ], options={'temperature': 0.4})
            return response['message']['content']
        except Exception as e:
            return "Keep your core tight and maintain steady breathing!"

    async def get_session_summary(self, session_data):
        prompt = f"""
        You are an Elite Biomechanics Coach.
        Workout Data: {json.dumps(session_data)}
        
        Task: 
        1. Summarize the total volume.
        2. Give 1 high-level technical critique based on the exercises performed.
        3. Maximum 50 words.
        4. Tone: Technical, Professional, and Elite.
        """
        try:
            response = await self.client.chat(model=self.model, messages=[
                {'role': 'user', 'content': prompt}
            ], options={'temperature': 0.5})
            return response['message']['content']
        except:
            return "Great session. Focus on consistency and progressive overload."

    async def get_diet_recommendation(self, workout_history):
        prompt = f"""
        Identify as an Elite Sports Nutritionist.
        Recent Workout Data: {json.dumps(workout_history)}
        
        Task:
        1. Predict Neural Macro Requirements (Protein, Carbs, Fats) based on the intensity and volume of the logged session.
        2. Suggest 1 recovery meal plan.
        3. Suggest 1 hydration strategy based on perceived fluid loss.
        4. Max 80 words.
        5. Tone: Technical, Bio-Metric focused.
        """
        try:
            response = await self.client.chat(model=self.model, messages=[
                {'role': 'user', 'content': prompt}
            ], options={'temperature': 0.6})
            return response['message']['content']
        except:
            return "Prioritize bio-available protein (30-40g) and fast-acting glycogen replenishment within the 60min window. Maintain electrolyte-stabilized hydration."

coach = CoachingAgent()
